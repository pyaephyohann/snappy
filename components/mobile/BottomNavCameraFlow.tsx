"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FriendsPickerPanel, {
  type FriendPickerUser,
} from "@/components/friends/FriendsPickerPanel";
import SnapCameraCapture from "@/components/snaps/SnapCameraCapture";
import SnapCreateComposerModal from "@/components/snaps/SnapCreateComposerModal";
import { isCameraCaptureSupported } from "@/lib/snap-camera";
import { uploadSnapForUser } from "@/lib/snap-upload-client";

type FlowStep = "pick-user" | "camera" | "composer";

interface BottomNavCameraFlowProps {
  onClose: () => void;
}

export default function BottomNavCameraFlow({
  onClose,
}: BottomNavCameraFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>("pick-user");
  const [friends, setFriends] = useState<FriendPickerUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<FriendPickerUser | null>(
    null,
  );
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [composerKey, setComposerKey] = useState(0);

  const resetFlow = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/users/list");
        if (!response.ok) {
          throw new Error("Could not load friends.");
        }
        const data = (await response.json()) as FriendPickerUser[];
        if (!cancelled) {
          setFriends(data);
          setFriendsError(null);
        }
      } catch {
        if (!cancelled) {
          setFriendsError("Could not load friends. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePickUser = (user: FriendPickerUser) => {
    setSelectedUser(user);
    if (!isCameraCaptureSupported()) {
      setComposerKey((k) => k + 1);
      setStep("composer");
      return;
    }
    setStep("camera");
  };

  const handleCapture = (file: File) => {
    setCapturedFile(file);
    setComposerKey((k) => k + 1);
    setStep("composer");
  };

  const handleUpload = async (file: File, caption?: string) => {
    if (!selectedUser) {
      throw new Error("No user selected for this snap.");
    }
    // Returns the server's Spark outcome + refreshed usage summary so the
    // composer can show the actual charge/reward without a second request.
    const result = await uploadSnapForUser(selectedUser.id, file, caption);
    router.refresh();
    return result;
  };

  return (
    <>
      {step === "pick-user" ? (
        <div
          className="safe-area-pt safe-area-pb fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="snap-user-picker-title"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={resetFlow}
            aria-hidden="true"
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2
                id="snap-user-picker-title"
                className="text-lg font-semibold text-foreground"
              >
                Choose who this Snap is for
              </h2>
              <button
                type="button"
                onClick={resetFlow}
                className="rounded p-2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5"
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
            <div className="p-4">
              {friendsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Loading friends…
                </p>
              ) : friendsError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {friendsError}
                </p>
              ) : (
                <FriendsPickerPanel friends={friends} onSelect={handlePickUser} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {step === "camera" ? (
        <SnapCameraCapture
          onCapture={handleCapture}
          onClose={() => setStep("pick-user")}
          onChooseGallery={() => {
            setComposerKey((k) => k + 1);
            setCapturedFile(null);
            setStep("composer");
          }}
        />
      ) : null}

      {step === "composer" && selectedUser ? (
        <SnapCreateComposerModal
          key={composerKey}
          onClose={resetFlow}
          onUpload={handleUpload}
          initialFile={capturedFile}
          recipientName={selectedUser.name}
          enableInModalCamera={false}
          onRetakePhoto={
            isCameraCaptureSupported()
              ? () => {
                  setCapturedFile(null);
                  setStep("camera");
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
