export interface Video {
  id: number;
  filename: string;
  original_name: string;
  file_path: string;
  thumbnail_path?: string | null;
  duration?: number;
  file_size: number;
  created_at: string;
}