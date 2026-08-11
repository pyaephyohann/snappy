'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FriendHeader from './FriendHeader';
import SnapGallery from './SnapGallery';
import SnapUploader from '../snaps/SnapUploader';

interface FriendWithSnaps {
  id: string;
  name: string;
  profileImage: string;
  createdAt: Date;
  snaps: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    createdAt: Date | string;
  }>;
}

interface FriendProfileClientProps {
  friend: FriendWithSnaps;
}

export default function FriendProfileClient({ friend }: FriendProfileClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    try {
      setError(null);

      // Step 1: Request Cloudinary signature
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureResponse = await fetch('/api/cloudinary/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp }),
      });

      if (!signatureResponse.ok) {
        throw new Error('Unable to start upload. Please try again.');
      }

      const signatureData = await signatureResponse.json();

      // Step 2: Upload directly to Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureData.api_key);
      formData.append('timestamp', signatureData.timestamp.toString());
      formData.append('signature', signatureData.signature);
      formData.append('folder', signatureData.folder);

      const cloudName = signatureData.cloud_name;
      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Image upload failed. Please try again.');
      }

      const uploadData = await uploadResponse.json();

      // Step 3: Create Snap via API
      const snapResponse = await fetch('/api/snaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: friend.id,
          imageUrl: uploadData.secure_url,
          publicId: uploadData.public_id,
        }),
      });

      if (!snapResponse.ok) {
        throw new Error('Image uploaded, but we couldn\'t save the Snap. Please try again.');
      }

      // Step 4: Refresh gallery to show new Snap
      router.refresh();

    } catch (error) {
      // Rethrow error to be handled by SnapUploader
      throw error;
    }
  };

  const handleRetry = () => {
    setError(null);
    router.refresh();
  };

  if (error) {
    return (
      <>
        <FriendHeader
          name={friend.name}
          profileImage={friend.profileImage}
          snapCount={friend.snaps.length}
        >
          <SnapUploader targetUserId={friend.id} onUpload={handleUpload} />
        </FriendHeader>

        <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <p className="text-muted-foreground text-sm sm:text-base mb-4">
            Something went wrong. We couldn&apos;t load the Snaps right now.
          </p>
          <button
            onClick={handleRetry}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Try Again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <FriendHeader
        name={friend.name}
        profileImage={friend.profileImage}
        snapCount={friend.snaps.length}
      >
        <SnapUploader targetUserId={friend.id} onUpload={handleUpload} />
      </FriendHeader>

      {!friend.snaps || friend.snaps.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No snaps yet</h3>
          <p className="text-muted-foreground text-sm sm:text-base mb-6">
            Be the first to add a snap to this collection.
          </p>
          <SnapUploader targetUserId={friend.id} onUpload={handleUpload} />
        </div>
      ) : (
        <SnapGallery snaps={friend.snaps} friendName={friend.name} />
      )}
    </>
  );
}
