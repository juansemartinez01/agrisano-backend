export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
  tenant_id: string;
};
