import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", ".prisma/client", "bcryptjs", "nodemailer"],
};

export default nextConfig;
