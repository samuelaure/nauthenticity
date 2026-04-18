import jwt from 'jsonwebtoken';
import { config } from '../config';

export function verifyJwt(token: string): jwt.JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}
