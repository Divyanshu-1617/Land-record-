import React, { useState, useRef } from 'react';
import { Icons } from './Icons';
import { analyzeLandImage } from '../services/geminiService';
import { AnalysisResult } from '../types';

// Mock presets for demo purposes
const PRESETS = [
  { id: 1, name: 'Agricultural Zone', url: 'https://picsum.photos/id/10/800/600', type: 'agri' },
  { id: 2, name: 'Urban Development', url: 'https://picsum.photos/id/122/800/600', type: 'urban' },
  { id: 3, name: 'Forest Reserve', url: 'https://picsum.photos/id/28/800/600', type: 'forest' },
];

export const MapExplorer: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string>(PRESETS[0].url);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async () => {
    if (!selectedImage) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      // Convert image URL to base64 for the API
      // Note: In a real production app with CORS issues, you'd proxy this.
      // For this demo, we'll fetch the blob and convert.
      const response = await fetch(selectedImage);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        const analysis = await analyzeLandImage(
            base64data, 
            "Identify vegetation health, potential water sources, and signs of construction or land degradation."
        );
        setResult(analysis);
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(blob);
      
    } catch (err) {
      console.error(err);
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedImage(url);
      setSelectedPreset(-1); // Custom
      setResult(null);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      {/* Map/Image Area */}
      <div className="flex-1 relative bg-slate-900 flex flex-col">
        {/* Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-2 justify-between pointer-events-none">
          <div className="flex gap-2 pointer-events-auto bg-white p-2 rounded-lg shadow-lg">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedImage(p.url);
                  setSelectedPreset(p.id);
                  setResult(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  selectedPreset === p.id 
                    ? 'bg-brand-600 text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.name}
              </button>
            ))}
            <div className="w-px bg-slate-200 mx-1"></div>
            <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center"
            >
                <Icons.Upload className="w-3 h-3 mr-1.5" />
                Upload
            </button>
          </div>
          
          <div className="pointer-events-auto">
             <button 
               onClick={handleAnalyze}
               disabled={isAnalyzing}
               className="flex items-center px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-lg shadow-lg hover:from-brand-500 hover:to-brand-400 disabled:opacity-70 transition-all font-medium text-sm"
             >
               {isAnalyzing ? (
                 <>
                   <Icons.Spinner className="w-4 h-4 mr-2 animate-spin" />
                   Processing...
                 </>
               ) : (
                 <>
                   <Icons.AI className="w-4 h-4 mr-2" />
                   Analyze Parcel
                 </>
               )}
             </button>
          </div>
        </div>

        {/* Image Viewport */}
        <div className="flex-1 relative flex items-center justify-center bg-black/90 overflow-hidden">
            <img 
                src={selectedImage} 
                alt="Satellite View" 
                className="max-w-full max-h-full object-contain"
            />
            {/* Grid Overlay Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20" 
                 style={{ 
                     backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
                     backgroundSize: '50px 50px'
                 }}
            />
            
            {/* Scanning Effect when analyzing */}
            {isAnalyzing && (
                 <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-brand-500/20 to-transparent animate-scan" style={{ height: '20%' }} />
            )}
        </div>
      </div>

      {/* Analysis Sidebar */}
      <div className="w-full md:w-96 bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
           <h2 className="font-semibold text-slate-900 flex items-center">
             <Icons.Report className="w-4 h-4 mr-2 text-brand-600" />
             Intelligence Report
           </h2>
        </div>

        <div className="p-5 flex-1">
          {!result ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-4">
               <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                 <Icons.Map className="w-8 h-8 text-slate-300" />
               </div>
               <p className="text-sm max-w-xs">Select a preset or upload an aerial image, then click <span className="font-semibold text-brand-600">Analyze Parcel</span> to generate AI insights.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* Score Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md">
                 <div className="flex justify-between items-start mb-2">
                    <span className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Suitability Score</span>
                    <Icons.Verified className="w-5 h-5 text-emerald-400" />
                 </div>
                 <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold">{result.suitabilityScore}</span>
                    <span className="text-sm text-slate-400 mb-1">/ 100</span>
                 </div>
                 <div className="mt-4 w-full bg-slate-700/50 rounded-full h-1.5">
                    <div 
                        className="h-1.5 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-emerald-400" 
                        style={{ width: `${result.suitabilityScore}%` }}
                    />
                 </div>
              </div>

              {/* Land Use & Soil */}
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Detected Land Use</p>
                    <p className="font-semibold text-slate-900">{result.landUse}</p>
                 </div>
                 <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Soil Estimation</p>
                    <p className="font-semibold text-slate-900">{result.soilTypeEstimation}</p>
                 </div>
              </div>

              {/* Summary */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">AI Summary</h3>
                <p className="text-sm text-slate-600 leading-relaxed bg-brand-50 p-3 rounded-lg border border-brand-100 text-brand-900">
                  {result.summary}
                </p>
              </div>

              {/* Recommendations */}
              <div>
                 <h3 className="text-sm font-semibold text-slate-900 mb-2">Crop Recommendations</h3>
                 <div className="flex flex-wrap gap-2">
                    {result.cropRecommendations.length > 0 ? result.cropRecommendations.map((crop, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                            {crop}
                        </span>
                    )) : <span className="text-sm text-slate-400">No specific crops recommended.</span>}
                 </div>
              </div>

               {/* Risks */}
               <div>
                 <h3 className="text-sm font-semibold text-slate-900 mb-2">Risk Factors</h3>
                 <ul className="space-y-2">
                    {result.risks.map((risk, i) => (
                        <li key={i} className="flex items-start text-sm text-slate-600">
                            <Icons.Alert className="w-4 h-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
                            {risk}
                        </li>
                    ))}
                 </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes scan {
          0% { top: -20%; }
          100% { top: 120%; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>
    </div>
  );
};
