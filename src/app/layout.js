import { Geist } from "next/font/google";
import { DemoDataProvider } from "@/features/demo-data/DemoDataProvider";
import { LiveAcademicCoordinatorProvider } from "@/features/academic/LiveAcademicCoordinatorProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "PLP Enrollment System",
    template: "%s | PLP Enrollment System",
  },
  description:
    "Pamantasan ng Lungsod ng Pasig Enrollment System access portal for staff and students.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body><DemoDataProvider><LiveAcademicCoordinatorProvider>{children}</LiveAcademicCoordinatorProvider></DemoDataProvider></body>
    </html>
  );
}
