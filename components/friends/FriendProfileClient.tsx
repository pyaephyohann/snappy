'use client';

import { useRouter } from 'next/navigation';
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

  const handleUpload = async (file: File) => {
    try {
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
          <p className="text-muted-foreground text-sm sm:text-base">
            {friend.name} hasn&apos;t shared any snaps yet.
          </p>
        </div>
      ) : (
        <SnapGallery snaps={friend.snaps} friendName={friend.name} />
      )}
    </>
  );
}
