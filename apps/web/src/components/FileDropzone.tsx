import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { CheckCircle, FileIcon, XCircle } from 'lucide-react';

interface FileDropzoneProps {
  label: string;
  accept: string;
  extension: string; // e.g. ".cer"
  id: string;
  onFile: (file: File | null) => void;
}

type DropStatus = 'idle' | 'hover' | 'success' | 'error';

export default function FileDropzone({ label, accept, extension, id, onFile }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<DropStatus>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  function validateAndSet(file: File) {
    if (!file.name.toLowerCase().endsWith(extension)) {
      setStatus('error');
      setErrorMsg(`Solo se aceptan archivos ${extension}`);
      setFileName(null);
      onFile(null);
      return;
    }
    setStatus('success');
    setFileName(file.name);
    setErrorMsg('');
    onFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
    else setStatus('idle');
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (status !== 'success') setStatus('hover');
  }

  function handleDragLeave() {
    if (status !== 'success') setStatus('idle');
  }

  const borderColor =
    status === 'success' ? 'border-emerald' :
    status === 'error'   ? 'border-red-500' :
    status === 'hover'   ? 'border-emerald dropzone-active' :
    'border-border';

  const bgColor =
    status === 'success' ? 'bg-emerald-lo' :
    status === 'error'   ? 'bg-red-950/30' :
    'bg-surface';

  return (
    <div>
      <label htmlFor={id} className="block text-sm text-muted mb-1.5 font-medium">
        {label}
      </label>
      <div
        className={`relative border-2 border-dashed rounded-xl px-5 py-5 flex items-center gap-4 cursor-pointer transition-colors duration-200 ${borderColor} ${bgColor}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        aria-label={`Seleccionar archivo ${extension} para ${label}`}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleChange}
          aria-label={label}
        />

        {status === 'success' ? (
          <CheckCircle
            size={22}
            className="shrink-0 text-emerald"
            aria-hidden="true"
          />
        ) : status === 'error' ? (
          <XCircle size={22} className="shrink-0 text-red-400" aria-hidden="true" />
        ) : (
          <FileIcon size={22} className="shrink-0 text-subtle" aria-hidden="true" />
        )}

        <div className="min-w-0">
          {status === 'success' && fileName ? (
            <p className="text-sm font-medium text-emerald truncate">{fileName}</p>
          ) : status === 'error' ? (
            <p className="text-sm text-red-400">{errorMsg}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                Arrastra o haz clic aquí
              </p>
              <p className="text-xs text-muted mt-0.5">
                Archivos <span className="font-mono">{extension}</span> únicamente
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
