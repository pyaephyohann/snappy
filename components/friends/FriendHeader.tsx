import Image from 'next/image';

interface FriendHeaderProps {
  name: string;
  profileImage: string;
  snapCount: number;
}

export default function FriendHeader({ name, profileImage, snapCount }: FriendHeaderProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-8 mb-8 shadow-lg">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Profile Image */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <div className="w-full h-full rounded-full overflow-hidden ring-4 ring-primary/20">
            <Image
              src={profileImage}
              alt={`${name}'s profile`}
              fill
              className="object-cover"
              sizes="128px"
            />
          </div>
        </div>

        {/* Friend Info */}
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-foreground mb-2">{name}</h1>
          <p className="text-muted-foreground">
            {snapCount} {snapCount === 1 ? 'snap' : 'snaps'}
          </p>
        </div>
      </div>
    </div>
  );
}
