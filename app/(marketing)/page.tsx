import LandingNavbar from "@/components/landing/LandingNavbar";
import Hero from "@/components/landing/Hero";
import SocialProof from "@/components/landing/SocialProof";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import ProductShowcase from "@/components/landing/ProductShowcase";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import LandingSplash from "@/components/landing/LandingSplash";

export default function LandingPage() {
  return (
    <LandingSplash>
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <main>
          <Hero />
          <SocialProof />
          <Features />
          <HowItWorks />
          <ProductShowcase />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </LandingSplash>
  );
}
