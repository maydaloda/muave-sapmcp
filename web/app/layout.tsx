import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuroraBg } from "./_components/AuroraBg";
import "./globals.css";

export const metadata: Metadata = {
  title: "muave-sapmcp",
  description: "Connect Claude to your SAP S/4HANA Cloud systems",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuroraBg />
        {children}
        <footer className="legal">
          <p>
            SAP, S/4HANA and other SAP products mentioned are trademarks or registered trademarks of
            SAP SE in Germany and other countries. Claude is a trademark of Anthropic. Use here is
            nominative and does not imply endorsement or affiliation.
          </p>
        </footer>
      </body>
    </html>
  );
}
