export interface AdminUser {
  id: string;
  name: string;
  role: "USER" | "ADMIN";
  profileImage: string;
  snapCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSnap {
  id: string;
  imageUrl: string;
  publicId: string;
  caption: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
}

export interface AdminHeroCarouselConfig {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface AdminHeroCarouselSlide {
  id: string;
  snapId: string;
  sortOrder: number;
  altText: string | null;
  createdAt: string;
  updatedAt: string;
  snap: {
    id: string;
    imageUrl: string;
    caption: string | null;
    user: {
      id: string;
      name: string;
      profileImage: string;
    };
  };
}

export function formatAdminDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
