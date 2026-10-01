/**
 * Next.js / React reference — drag & drop batch uploader.
 * Angular live twin: `src/app/pages/smartcrop/components/file-uploader/`
 */
'use client';

import { useCallback, useState } from 'react';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic';

export type PrintSizeOption = { id: string; name: string; label?: string };

export interface FileUploaderProps {
  sizes: PrintSizeOption[];
  defaultSizeName?: string;
  busy?: boolean;
  onUpload: (files: File[], sizeName: string) => void | Promise<void>;
}

export function FileUploader({
  sizes,
  defaultSizeName = '10x15',
  busy = false,
  onUpload,
}: FileUploaderProps) {
  const [sizeName, setSizeName] = useState(defaultSizeName);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (list: FileList | File[] | null) => {
      if (!list?.length || busy) return;
      const files = Array.from(list).filter((f) => /^image\//i.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
      if (!files.length) return;
      await onUpload(files, sizeName);
    },
    [busy, onUpload, sizeName],
  );

  return (
    <div className="sc-uploader" dir="auto">
      {/* <label className="sc-uploader__size">
        <span>Print size</span>
        <select value={sizeName} onChange={(e) => setSizeName(e.target.value)} disabled={busy}>
          {sizes.map((s) => (
            <option key={s.id} value={s.name}>
              {s.label ?? s.name}
            </option>
          ))}
        </select>
      </label> */}

      <div
        className={`sc-uploader__zone${dragging ? ' is-drag' : ''}${busy ? ' is-busy' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <p>Drag & drop photos here</p>
        <p className="sc-uploader__hint">JPG · PNG · WebP · HEIC — batch supported</p>
        <label className="sc-uploader__pick">
          Choose files
          <input
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}

export default FileUploader;
