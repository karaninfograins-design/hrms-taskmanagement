export type User = {
  id?: number;
  name: string;
  email: string;
  phoneNumber?: string | null;
  role: string;
  designation?: string | null;
  permissions?: string[];
  status?: string;
};

export type Session = {
  token: string;
  user: User;
};

export type LoginCredentials = {
  email: string;
  password: string;
};
