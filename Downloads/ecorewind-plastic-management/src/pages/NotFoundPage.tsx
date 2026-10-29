import React from "react";
import { Button } from "../components/Button";
import { ArrowLeft, Recycle } from "lucide-react";

interface NotFoundPageProps {
  onGoHome: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onGoHome }) => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-3xl bg-[#E5F0EA] flex items-center justify-center text-[#1F5C45] mb-4">
        <Recycle className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-bold font-heading text-[#12372A]">Page Not Found</h1>
      <p className="text-sm text-[#5B655F] mt-2 max-w-sm">
        The reverse vending machine route you requested does not exist or has been relocated.
      </p>
      <div className="mt-6">
        <Button variant="primary" size="md" onClick={onGoHome} className="gap-2 bg-[#1F5C45] text-white">
          <ArrowLeft className="w-4 h-4" />
          <span>Return Home</span>
        </Button>
      </div>
    </div>
  );
};
