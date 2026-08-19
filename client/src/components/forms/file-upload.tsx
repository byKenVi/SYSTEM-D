import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Film } from "lucide-react";

interface UploadedFile {
  id?: number; // persisted DB id returned by the server after upload
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

interface FileUploadProps {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  formSubmissionId: number;
  fieldKey: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
}

export function FileUpload({ value = [], onChange, formSubmissionId, fieldKey, accept, multiple = true, disabled, label }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("formSubmissionId", String(formSubmissionId));
      formData.append("fieldKey", fieldKey);
      try {
        const res = await fetch("/api/forms/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          // Retain the server-assigned id for later deletion
          newFiles.push({
            id: typeof data.id === "number" ? data.id : undefined,
            fileName: data.fileName ?? data.file_name ?? file.name,
            fileUrl: data.fileUrl ?? data.file_url ?? "",
            fileType: data.fileType ?? data.file_type ?? file.type,
            fileSize: data.fileSize ?? data.file_size ?? file.size,
          });
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    onChange([...value, ...newFiles]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function removeFile(index: number) {
    const file = value[index];
    // If the file has a server-assigned id, call the server delete route
    if (file?.id) {
      try {
        const response = await fetch(`/api/form-uploads/${file.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) {
          console.error("Remote delete failed:", response.status);
          return;
        }
      } catch (err) {
        console.error("Remote delete failed:", err);
        return;
      }
    }
    onChange(value.filter((_, i) => i !== index));
  }

  const isImage = (type: string) => type.startsWith("image/");
  const isVideo = (type: string) => type.startsWith("video/");

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div
        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) handleFiles(e.dataTransfer.files); }}
        data-testid="dropzone-upload"
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept || ".jpg,.jpeg,.png,.heic,.pdf,.mp4,.mov"}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
        <p className="text-sm text-muted-foreground">
          {uploading ? "Téléversement..." : "Glisser des fichiers ou cliquer pour sélectionner"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">JPG, PNG, HEIC, PDF, MP4, MOV (max 25 Mo)</p>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {value.map((file, i) => (
            <div key={i} className="relative group border rounded-lg overflow-hidden bg-muted/30">
              {isImage(file.fileType) ? (
                <img src={file.fileUrl} alt={file.fileName} className="w-full h-24 object-cover" />
              ) : isVideo(file.fileType) ? (
                <div className="w-full h-24 flex items-center justify-center bg-muted">
                  <Film className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-muted">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <p className="text-xs truncate px-2 py-1">{file.fileName}</p>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  className="absolute top-1 right-1 h-9 w-9 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  aria-label={`Supprimer ${file.fileName}`}
                  data-testid={`button-remove-file-${i}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
