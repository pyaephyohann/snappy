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
