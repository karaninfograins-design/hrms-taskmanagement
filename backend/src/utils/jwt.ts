import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in .env");
}

export interface JwtPayload {
  userId: number;
}

export const generateToken = (userId: number): string => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};