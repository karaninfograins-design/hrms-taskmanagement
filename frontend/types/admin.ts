export type CreateAdminInput = {
  name: string;
  email: string;
  password: string;
};

export type CreatedAdmin = {
  id: number;
  name: string;
  email: string;
  status: string;
};
