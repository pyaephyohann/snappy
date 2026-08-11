"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";

interface SnapUploaderProps {
  onUpload?: (file: File, caption?: string) => Promise<void>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_CAPTION_LENGTH = 500;

export default function SnapUploader({
  onUpload,
}: SnapUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success">("idle");
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "selecting" | "uploading" | "saving"
  >("idle");

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileValidation = (file: File): boolean => {
    setError(null);

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image.");
      return false;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError("That image is too large. Please choose an image under 10 MB.");
      return false;
    }

    return true;
  };

  const handleFileSelect = (file: File) => {
    if (!handleFileValidation(file)) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile || !onUpload) return;

    setIsUploading(true);
    setError(null);
    setUploadPhase("uploading");

    try {
      await onUpload(selectedFile, caption);
      setUploadPhase("saving");
      setUploadStatus("success");

      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
      setIsUploading(false);
      setUploadPhase("idle");
    }
  };

  const handleCancel = () => {
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } =
    useDropzone({
      accept: {
        "image/*": [],
      },
      maxSize: MAX_FILE_SIZE,
      multiple: false,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles.length > 0) {
          handleFileSelect(acceptedFiles[0]);
        }
      },
      onDropRejected: (fileRejections) => {
        if (fileRejections.length > 0) {
          const rejection = fileRejections[0];
          if (rejection.errors.some((e) => e.code === "file-too-large")) {
            setError(
              "That image is too large. Please choose an image under 10 MB.",
            );
          } else if (
            rejection.errors.some((e) => e.code === "file-invalid-type")
          ) {
            setError("Please select an image.");
          } else {
            setError("Please select a valid image file.");
          }
        }
      },
    });

  const handleOpen = () => {
    setIsOpen(true);
    setError(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption("");
    setUploadStatus("idle");
    setUploadPhase("idle");
  };

  const handleClose = () => {
    setIsOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(null);
    setCaption("");
    setError(null);
    setUploadStatus("idle");
    setUploadPhase("idle");
    setIsUploading(false);
  };

  return (
    <>
      {/* Add Snap Button */}
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background text-sm sm:text-base"
        aria-label="Add snap"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add Snap
      </button>

      {/* Upload Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
          onKeyDown={handleKeyDown}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
              <h2
                id="upload-modal-title"
                className="text-lg sm:text-xl font-semibold text-foreground"
              >
                Add Snap
              </h2>
              <button
                onClick={handleClose}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded"
                aria-label="Close modal"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6">
              {/* Error Message */}
              {error && (
                <div
                  className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Image Preview */}
              {previewUrl ? (
                <div className="mb-6">
                  <div className="relative aspect-square sm:aspect-video w-full bg-muted rounded-lg overflow-hidden border border-border">
                    {/* img element used for local blob URL preview - Next.js Image doesn't support blob URLs */}
                    <img
                      src={previewUrl}
                      alt="Selected image preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground text-center">
                    {selectedFile?.name}
                  </p>
                </div>
              ) : (
                <div className="mb-6">
                  <div
                    {...getRootProps()}
                    className={`aspect-square sm:aspect-video w-full bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center transition-colors ${
                      isDragActive
                        ? "border-primary bg-primary/5"
                        : isDragReject
                          ? "border-destructive bg-destructive/5"
                          : ""
                    }`}
                  >
                    <input {...getInputProps()} />
                    <div className="text-center p-6">
                      <svg
                        className="w-12 h-12 mx-auto text-muted-foreground mb-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-sm text-muted-foreground">
                        {isDragActive
                          ? "Drop image here"
                          : "Select or Drop an image to preview"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Caption Input */}
              {previewUrl && (
                <div className="mb-6">
                  <label
                    htmlFor="caption-input"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Caption
                  </label>
                  <textarea
                    id="caption-input"
                    value={caption}
                    onChange={(e) => {
                      if (e.target.value.length <= MAX_CAPTION_LENGTH) {
                        setCaption(e.target.value);
                      }
                    }}
                    placeholder="Write a caption..."
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none text-sm"
                    maxLength={MAX_CAPTION_LENGTH}
                    disabled={isUploading || uploadStatus === "success"}
                  />
                  <div className="mt-1 text-xs text-muted-foreground text-right">
                    {caption.length}/{MAX_CAPTION_LENGTH}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={open}
                  disabled={isUploading || uploadStatus === "success"}
                  className="flex-1 px-4 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {previewUrl ? "Change Image" : "Select Image"}
                </button>

                <button
                  onClick={handleCancel}
                  disabled={isUploading || uploadStatus === "success"}
                  className="flex-1 px-4 py-3 border border-border text-foreground rounded-lg hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  Cancel
                </button>

                {onUpload && (
                  <button
                    onClick={handleUpload}
                    disabled={
                      !selectedFile || isUploading || uploadStatus === "success"
                    }
                    className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                  >
                    {uploadPhase === "uploading"
                      ? "Uploading image..."
                      : uploadPhase === "saving"
                        ? "Saving snap..."
                        : uploadStatus === "success"
                          ? "Uploaded ✓"
                          : "Upload"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
