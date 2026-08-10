import Image from 'next/image';

interface FriendHeaderProps {
  name: string;
  profileImage: string;
  snapCount: number;
}

export default function FriendHeader({ name, profileImage, snapCount }: FriendHeaderProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8 shadow-lg">
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {/* Profile Image */}
        <div className="relative w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 flex-shrink-0">
          <div className="w-full h-full rounded-full overflow-hidden ring-3 sm:ring-4 ring-primary/20">
            <Image
              src={profileImage}
              alt={`${name}'s profile`}
              fill
              className="object-cover"
              sizes="80px, 112px, 128px"
              unoptimized={profileImage.includes('.svg') || profileImage.includes('dicebear')}
            />
          </div>
        </div>

        {/* Friend Info */}
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">{name}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {snapCount} {snapCount === 1 ? 'snap' : 'snaps'}
          </p>
        </div>
      </div>
    </div>
  );
}
