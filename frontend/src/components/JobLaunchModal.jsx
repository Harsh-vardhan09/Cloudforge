import React, { useRef, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Cpu,
  Database,
  FileCode,
  Lightbulb,
  Loader2,
  PlayCircle,
  Server,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '../services/api';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SCRIPT_EXTENSIONS = /\.(py|sh|ipynb)$/i;
const DATASET_EXTENSIONS = /\.(csv|json|jsonl|txt|zip|tar|tar\.gz|npy|npz|parquet)$/i;

const JobLaunchModal = ({ gpu = null, showcaseGpu = null, onClose, onSuccess, initialConfig = null }) => {
  const scriptInputRef = useRef(null);
  const datasetInputRef = useRef(null);
  const [scriptName, setScriptName] = useState(initialConfig?.scriptName || '');
  const [scriptContent, setScriptContent] = useState(initialConfig?.scriptContent || '');
  const [datasetFile, setDatasetFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [applied, setApplied] = useState(false);
  const [dockerImage, setDockerImage] = useState(initialConfig?.dockerImage || 'pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime');
  const [command, setCommand] = useState(initialConfig?.command || '');
  const [vramRequired, setVramRequired] = useState(initialConfig?.vramRequired || gpu?.vram || 8);
  const [env, setEnv] = useState(initialConfig?.env || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleScriptChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!SCRIPT_EXTENSIONS.test(file.name)) {
      setError('Choose a Python (.py), shell (.sh), or Jupyter Notebook (.ipynb) script.');
      event.target.value = '';
      return;
    }
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
      setError('Script files must be between 1 byte and 50 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setScriptName(file.name);
      setScriptContent(content);
      setRecommendation(null);
      setApplied(false);
      setError('');
      const path = `/workspace/${file.name}`;
      setCommand(file.name.toLowerCase().endsWith('.sh')
        ? `bash ${path}`
        : file.name.toLowerCase().endsWith('.ipynb')
          ? `mkdir -p /workspace/output && jupyter nbconvert --to notebook --execute ${path} --output-dir /workspace/output`
          : `python ${path}`);
    };
    reader.onerror = () => setError('Could not read the selected script file.');
    reader.readAsText(file);
  };

  const handleDatasetChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!DATASET_EXTENSIONS.test(file.name)) {
      setError('Supported datasets: .csv, .json, .jsonl, .txt, .zip, .tar, .tar.gz, .npy, .npz, and .parquet.');
      event.target.value = '';
      return;
    }
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
      setError('Dataset files must be between 1 byte and 50 MB.');
      event.target.value = '';
      return;
    }
    setDatasetFile(file);
    setRecommendation(null);
    setApplied(false);
    setError('');
  };

  const requestRecommendation = async () => {
    if (!prompt.trim()) {
      setError('Describe the workload you want to run first.');
      return;
    }

    setBusy(true);
    setError('');
    setApplied(false);
    try {
      const { data } = await api.post('/ai/assistant', {
        prompt: prompt.trim(),
        gpuModel: gpu?.model,
        gpuVram: gpu?.vram,
        currentCommand: command,
        currentImage: dockerImage,
        scriptName,
        scriptContent,
        datasetName: datasetFile?.name || '',
      });
      setRecommendation(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not prepare workload recommendations.');
    } finally {
      setBusy(false);
    }
  };

  const applyRecommendation = () => {
    if (!recommendation) return;
    setDockerImage(recommendation.dockerImage || dockerImage);
    setCommand(recommendation.command || command);
    setVramRequired(recommendation.vramRequired ?? vramRequired);
    setEnv({
      ...(recommendation.suggestedEnv || {}),
      ...(datasetFile ? { DATASET_PATH: `/workspace/data/${datasetFile.name}` } : {}),
    });
    if (recommendation.suggestedScript) {
      setScriptContent(recommendation.suggestedScript);
      setScriptName(recommendation.suggestedScriptName || scriptName || 'recommended_job.py');
    }
    setApplied(true);
  };

  const uploadInputFile = async (file, kind) => {
    const { data: upload } = await api.post('/jobs/uploads/presign', {
      fileName: file.name,
      size: file.size,
      kind,
    });
    if (!upload?.url || !upload?.fields || !upload?.objectKey) {
      throw new Error('Object storage did not provide a valid upload request.');
    }
    const body = new FormData();
    Object.entries(upload.fields).forEach(([key, value]) => body.append(key, value));
    body.append('file', new File([file], file.name, { type: upload.contentType }), file.name);
    let response;
    try {
      response = await fetch(upload.url, { method: 'POST', body });
    } catch {
      throw new Error('Could not reach S3. Check bucket CORS and endpoint settings.');
    }
    if (!response.ok) throw new Error(`S3 ${kind} upload failed (HTTP ${response.status}).`);
    return upload.objectKey;
  };

  const submitJob = async () => {
    if (!applied) {
      setError('Review and apply the workload recommendation before submitting.');
      return;
    }
    if (!command.trim()) {
      setError('The recommendation must include an execution command.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      let inputObjectKey = '';
      if (scriptName) {
        const contentType = scriptName.toLowerCase().endsWith('.sh')
          ? 'text/x-shellscript'
          : scriptName.toLowerCase().endsWith('.ipynb')
            ? 'application/x-ipynb+json'
            : 'text/x-python';
        const scriptFile = new File([scriptContent], scriptName, { type: contentType });
        inputObjectKey = await uploadInputFile(scriptFile, 'script');
      }
      const datasetObjectKey = datasetFile
        ? await uploadInputFile(datasetFile, 'dataset')
        : '';
      const { data } = await api.post('/jobs', {
        dockerImage,
        command,
        vramRequired: Number(vramRequired),
        env,
        gpuId: gpu?._id,
        scriptName,
        inputObjectKey,
        datasetName: datasetFile?.name || '',
        datasetObjectKey,
      });
      onSuccess(data);
      onClose();
    } catch (submitError) {
      setError(submitError.response?.data?.message || submitError.message || 'Could not submit the job.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/30 backdrop-blur-md"
        onClick={onClose}
      />
      <Motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className="glass-card relative flex max-h-[92vh] w-full max-w-3xl flex-col gap-5 overflow-y-auto p-6 md:p-8"
      >
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-purple-500 to-accent" />
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Sparkles className="text-primary" />
              Prepare a GPU workload
            </h2>
            <p className="mt-1 text-xs text-text-dim">
              Describe the goal. The assistant will review your files and recommend the setup before you submit.
            </p>
            {showcaseGpu && (
              <p className="mt-2 max-w-xl rounded-lg border border-accent/40 bg-accent/15 px-3 py-2 text-xs text-text">
                “{showcaseGpu.model}” is a showcase listing. Your job will run on your registered {gpu?.model} ({gpu?.vram} GB) GPU.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded border border-primary/30 bg-primary/20 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-primary">
              {gpu ? gpu.model : 'Cluster Pool'}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="text-text-dim hover:text-white">
              <X size={20} />
            </button>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5">
          <label htmlFor="workload-prompt" className="flex items-center gap-2 text-sm font-bold text-white">
            <Lightbulb size={17} className="text-purple-300" />
            What do you want to run?
          </label>
          <textarea
            id="workload-prompt"
            rows={3}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setRecommendation(null);
              setApplied(false);
            }}
            placeholder="Train a PyTorch image classifier on my CIFAR-10 script, using the GPU"
            className="w-full resize-y rounded-xl border border-ink/15 bg-surface-muted p-3 text-sm text-white placeholder-white/40 focus:border-purple-400 focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <input
                ref={scriptInputRef}
                type="file"
                accept=".py,.sh,.ipynb"
                onChange={handleScriptChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => scriptInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-ink/15 bg-white/5 px-3 py-3 text-xs font-semibold text-white hover:bg-white/10"
              >
                <FileCode size={16} />
                {scriptName || 'Add script (optional)'}
              </button>
              <span className="text-[0.68rem] text-text-dim">Python, shell, or notebook · up to 50 MB</span>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <input
                ref={datasetInputRef}
                type="file"
                accept=".csv,.json,.jsonl,.txt,.zip,.tar,.gz,.npy,.npz,.parquet"
                onChange={handleDatasetChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => datasetInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-ink/15 bg-white/5 px-3 py-3 text-xs font-semibold text-white hover:bg-white/10"
              >
                <Database size={16} />
                {datasetFile?.name || 'Add dataset (optional)'}
              </button>
              <span className="text-[0.68rem] text-text-dim">CSV, JSON, archives, NumPy, Parquet · up to 50 MB</span>
            </div>
          </div>
          {(scriptName || datasetFile) && (
            <div className="flex flex-wrap gap-2">
              {scriptName && (
                <button
                  type="button"
                  onClick={() => {
                    setScriptName('');
                    setScriptContent('');
                    setRecommendation(null);
                    setApplied(false);
                    if (scriptInputRef.current) scriptInputRef.current.value = '';
                  }}
                  className="flex items-center gap-1 rounded-lg border border-ink/15 px-2 py-1 text-[0.68rem] text-text-dim hover:text-white"
                >
                  <Trash2 size={12} /> Remove script
                </button>
              )}
              {datasetFile && (
                <button
                  type="button"
                  onClick={() => {
                    setDatasetFile(null);
                    setRecommendation(null);
                    setApplied(false);
                    if (datasetInputRef.current) datasetInputRef.current.value = '';
                  }}
                  className="flex items-center gap-1 rounded-lg border border-ink/15 px-2 py-1 text-[0.68rem] text-text-dim hover:text-white"
                >
                  <Trash2 size={12} /> Remove dataset
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={requestRecommendation}
            disabled={busy || !prompt.trim()}
            className="flex items-center justify-center gap-2 self-start rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {aiLoadingIcon(busy)}
            {busy ? 'Preparing recommendation…' : 'Get AI recommendations'}
          </button>
        </section>

        <AnimatePresence>
          {recommendation && (
            <Motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Lightbulb size={16} className="text-primary" /> Review workload plan
                </h3>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[0.65rem] text-text-dim">
                  {recommendation.source === 'llm' ? 'Cloud AI' : 'Local rules'}
                </span>
                {recommendation.checkpointSupported && (
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] text-emerald-300">
                    Checkpoint code included
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-text-dim">{recommendation.explanation}</p>
              {recommendation.source !== 'llm' && (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                  Local recommendations use rules, not a hosted AI model. They do not automatically rewrite an uploaded script.
                </p>
              )}
              {datasetFile && recommendation.datasetPlan && (
                <p className={`rounded-lg border px-3 py-2 text-xs ${
                  recommendation.datasetUsed
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                }`}>
                  {recommendation.datasetPlan}
                </p>
              )}
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-xl border border-ink/15 bg-surface-muted p-3">
                  <span className="flex items-center gap-1.5 text-text-dim"><Server size={13} /> Docker image</span>
                  <p className="mt-1 break-all font-mono text-white">{recommendation.dockerImage}</p>
                </div>
                <div className="rounded-xl border border-ink/15 bg-surface-muted p-3">
                  <span className="flex items-center gap-1.5 text-text-dim"><Cpu size={13} /> GPU memory</span>
                  <p className="mt-1 text-white">{recommendation.vramRequired} GB</p>
                </div>
                <div className="rounded-xl border border-ink/15 bg-surface-muted p-3">
                  <span className="text-text-dim">Suggested batch size</span>
                  <p className="mt-1 text-white">
                    {recommendation.batchSize ?? 'Not specified'}
                    <span className="ml-1 text-text-dim">· use if the script supports it</span>
                  </p>
                </div>
                <div className="rounded-xl border border-ink/15 bg-surface-muted p-3">
                  <span className="text-text-dim">Checkpointing</span>
                  <p className="mt-1 text-white">{recommendation.checkpointPlan || 'No checkpoint plan provided.'}</p>
                </div>
              </div>
              {recommendation.optimizations?.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-text-dim">
                  {recommendation.optimizations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ul>
              )}
              {datasetFile && (
                <p className="text-xs text-text-dim">
                  Dataset will be available to the job at <code className="text-white">/workspace/data/{datasetFile.name}</code>.
                </p>
              )}
              {recommendation.suggestedScript && (
                <details className="rounded-xl border border-ink/15 bg-surface-muted p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-white">
                    Review suggested script · {recommendation.suggestedScriptName || scriptName || 'recommended_job.py'}
                  </summary>
                  <textarea
                    rows={10}
                    value={recommendation.suggestedScript}
                    onChange={(event) => setRecommendation({ ...recommendation, suggestedScript: event.target.value })}
                    className="mt-3 w-full rounded-lg border border-ink/15 bg-surface-muted p-3 font-mono text-xs text-white focus:border-primary focus:outline-none"
                  />
                </details>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/15 pt-3">
                <div className="min-w-0 text-[0.7rem] text-text-dim">
                  <p className="truncate">Command: <code className="text-white">{recommendation.command}</code></p>
                  {recommendation.datasetPath && <p>Dataset path: <code className="text-white">{recommendation.datasetPath}</code></p>}
                </div>
                <button
                  type="button"
                  onClick={applyRecommendation}
                  disabled={applied}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-text hover:brightness-110 disabled:opacity-70"
                >
                  {applied ? <Check size={14} /> : <ArrowRight size={14} />}
                  {applied ? 'Applied' : 'Apply plan'}
                </button>
              </div>
            </Motion.section>
          )}
        </AnimatePresence>

        {applied && (
          <div className="flex flex-col gap-2 rounded-xl border border-ink/15 bg-white/[0.03] p-4 text-xs text-text-dim">
            <span className="font-semibold text-white">Ready to submit</span>
            <span>{dockerImage} · {vramRequired} GB VRAM · {scriptName || 'Generated command'}</span>
            {scriptName && (
              <details>
                <summary className="cursor-pointer text-primary">Review script before submission</summary>
                <textarea
                  rows={8}
                  value={scriptContent}
                  onChange={(event) => setScriptContent(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-ink/15 bg-surface-muted p-3 font-mono text-xs text-white"
                />
              </details>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center justify-center gap-2 rounded-lg border border-error/20 bg-error/10 p-3 text-center text-xs font-bold text-error">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <footer className="flex flex-col gap-3 border-t border-ink/15 pt-4 sm:flex-row">
          <button
            type="button"
            onClick={submitJob}
            disabled={busy || !applied}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
            Submit job to queue
          </button>
        </footer>
      </Motion.div>
    </div>
  );
};

const aiLoadingIcon = (busy) => busy
  ? <Loader2 className="animate-spin" size={16} />
  : <Sparkles size={16} />;

export default JobLaunchModal;
