'use client';

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
  const handleUpload = async (file: File) => {
    // Placeholder for upload logic - will be connected in Milestone 7E
    console.log('Upload callback called with file:', file.name);
    console.log('Target user ID:', friend.id);
    
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // For now, just log - actual Cloudinary integration comes in Milestone 7E
    console.log('Upload placeholder - Cloudinary integration will be added in Milestone 7E');
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
