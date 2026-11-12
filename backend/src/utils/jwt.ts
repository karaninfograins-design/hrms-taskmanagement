import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in .env");
}

export interface JwtPayload {
  userId: number;
}

export interface PasswordResetPayload {
  userId: number;
  email: string;
  hashSlice: string;
  type: "PASSWORD_RESET";
}

export const generateToken = (userId: number): string => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};

export const generatePasswordResetToken = (
  userId: number,
  email: string,
  passwordHash: string
): string => {
  return jwt.sign(
    {
      userId,
      email,
      hashSlice: passwordHash.slice(-10),
      type: "PASSWORD_RESET",
    },
    JWT_SECRET,
    {
      expiresIn: "1h",
    }
  );
};

export const verifyPasswordResetToken = (token: string): PasswordResetPayload => {
  const payload = jwt.verify(token, JWT_SECRET) as PasswordResetPayload;
  if (payload.type !== "PASSWORD_RESET") {
    throw new Error("Invalid reset token type");
  }
  return payload;
};
