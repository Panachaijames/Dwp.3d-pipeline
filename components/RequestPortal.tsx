"use client";

import React, { useState } from 'react';
import { FileText, Calendar, Building2, Send, Upload, User, Layout, Briefcase, ChevronDown, ChevronRight, ArrowLeft, HardDrive, X } from 'lucide-react';
import { ProjectRequest, ProjectArea, InputType, OutputType } from '../types';
import { DrivePicker } from './SubmissionPortal/DrivePicker';

interface RequestPortalProps {
  onSubmit: (request: ProjectRequest) => void;
}

export const RequestPortal: React.FC<RequestPortalProps> = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    studioFullName: '',
    projectNumber: '',
    requestName: '',
    projectName: '',
    department: '',
    requester: '',
    numberOfRenderings: '1',
    sharedPresentationLink: '',
    designReviewBooking: '',
    providedFiles: '',
    description: '',
    deadline: '',
    preferredTool: '',
    driveFolderId: '',
    driveFolderName: '',
    areas: [
      { id: 1, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
      { id: 2, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
      { id: 3, scope: '', designer: '', startDate: '', targetDate: '', description: '' }
    ] as ProjectArea[]
  });

  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const [expandedArea, setExpandedArea] = useState<number | null>(1);

  const handleAreaChange = (index: number, field: keyof ProjectArea, value: string) => {
    const newAreas = [...formData.areas];
    newAreas[index] = { ...newAreas[index], [field]: value };
    setFormData({ ...formData, areas: newAreas });
  };

  const generateRequestId = (studioName: string) => {
    // Generate simplified code: FIRST 2 chars of Studio or 'XX'
    let studioCode = 'XX';
    if (studioName && studioName.trim().length >= 2) {
      studioCode = studioName.trim().substring(0, 2).toUpperCase();
    }

    // Fallback logic if needed (e.g. spaces) simplified for now

    const now = new Date();
    const yearShort = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const randomChars = Math.random().toString(36).substring(2, 4).toUpperCase();

    return `${studioCode}${yearShort}${month}${day}${randomChars}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic ID generation logic (will be handled/verified by backend usually, but mimicking GAS logic here)
    const newId = generateRequestId(formData.studioFullName);

    const newRequest: ProjectRequest = {
      id: newId,
      studioFullName: formData.studioFullName,
      projectNumber: formData.projectNumber,
      requestName: formData.requestName,
      projectName: formData.projectName,
      department: formData.department,
      requester: formData.requester,
      numberOfRenderings: parseInt(formData.numberOfRenderings) || 0,
      sharedPresentationLink: formData.sharedPresentationLink,
      designReviewBooking: formData.designReviewBooking,
      providedFiles: formData.providedFiles ? formData.providedFiles.split(',').map(s => s.trim()) : [],
      description: formData.description,
      deadline: formData.deadline,
      inputType: undefined,
      outputType: undefined,
      preferredTool: formData.preferredTool as any,
      areas: formData.areas,
      driveFolderId: formData.driveFolderId,
      driveFolderName: formData.driveFolderName,
      status: 'Submitted',
      currentPhase: 'queued',
      progress: 0,
      priority: 'Medium',
      submittedBy: 'Current User', // Placeholder until Auth is fully integrated
      timestamp: new Date().toISOString()
    };

    onSubmit(newRequest);

    // Reset form mostly
    setFormData({
      studioFullName: '',
      projectNumber: '',
      requestName: '',
      projectName: '',
      department: '',
      requester: '',
      numberOfRenderings: '1',
      sharedPresentationLink: '',
      designReviewBooking: '',
      providedFiles: '',
      description: '',
      deadline: '',
      preferredTool: '',
      driveFolderId: '',
      driveFolderName: '',
      areas: [
        { id: 1, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
        { id: 2, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
        { id: 3, scope: '', designer: '', startDate: '', targetDate: '', description: '' }
      ]
    });
    setExpandedArea(1);
    setShowDrivePicker(false);
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">Submit 3D Project Request</h2>
        <p className="text-zinc-400">Complete the form below to initiate a new visualization project.</p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Section 1: Project Basics */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-800 pb-2">Project Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Studio Full Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 text-zinc-400 dark:text-zinc-500" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.studioFullName}
                    onChange={(e) => setFormData({ ...formData, studioFullName: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="e.g. DWP Bangkok"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Project Number</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 text-zinc-500" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.projectNumber}
                    onChange={(e) => setFormData({ ...formData, projectNumber: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="e.g. 24-0045"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Request Name</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 text-zinc-500" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.requestName}
                    onChange={(e) => setFormData({ ...formData, requestName: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="Unique title for this request"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Project Name</label>
                <div className="relative">
                  <Layout className="absolute left-3 top-3 text-zinc-500" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="Official Project Name"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 1.5: Project Folder (New) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">Destination Folder</h3>
              <span className="text-xs text-zinc-500">Where should files be uploaded?</span>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              {!formData.driveFolderId ? (
                <div>
                  <p className="text-sm text-zinc-500 mb-4">Please select a Google Drive folder for this project. All submissions will be automatically uploaded there.</p>
                  <button
                    type="button"
                    onClick={() => setShowDrivePicker(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                  >
                    <HardDrive size={18} className="text-blue-500" />
                    Select Drive Folder
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-white dark:bg-zinc-800 p-4 rounded-lg border border-blue-200 dark:border-blue-900/30 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <HardDrive size={24} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">Selected Folder</p>
                      <p className="text-base font-bold text-blue-600 dark:text-blue-400">{formData.driveFolderName}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, driveFolderId: '', driveFolderName: '' })}
                    className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}

              {showDrivePicker && (
                <div className="mt-4 animate-in fade-in zoom-in-95 duration-200">
                  <DrivePicker
                    onSelect={(id, name) => {
                      setFormData({ ...formData, driveFolderId: id, driveFolderName: name });
                      setShowDrivePicker(false);
                    }}
                    onCancel={() => setShowDrivePicker(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Requester Details */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-800 pb-2">Requester Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Requester Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-zinc-500" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.requester}
                    onChange={(e) => setFormData({ ...formData, requester: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="Your Name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Department</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 text-zinc-500" size={18} />
                  <select
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors appearance-none"
                  >
                    <option value="" disabled>Select Department</option>
                    <option value="Architecture">Architecture</option>
                    <option value="Interior Design">Interior Design</option>
                    <option value="Urban Planning">Urban Planning</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Product">Product Design</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Requirements and Tooling */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Requirements - Span 2 cols */}
            <div className="lg:col-span-2 space-y-6">
              <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-800 pb-2">Requirements</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Number of Renderings</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.numberOfRenderings}
                    onChange={(e) => setFormData({ ...formData, numberOfRenderings: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 px-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Deadline</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-zinc-500 pointer-events-none" size={18} />
                    <input
                      required
                      type="date"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors cursor-pointer relative z-10"
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Provided Files (Links)</label>
                  <div className="relative">
                    <Upload className="absolute left-3 top-3 text-zinc-500" size={18} />
                    <input
                      type="text"
                      value={formData.providedFiles}
                      onChange={(e) => setFormData({ ...formData, providedFiles: e.target.value })}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                      placeholder="Paste file links separated by commas"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Preferred Tool - Right Box */}
            <div className="lg:col-span-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 h-fit">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layout size={16} className="text-purple-500" />
                Preferred Tool
              </h3>

              <div className="space-y-3">
                {['3ds Max', 'Render for Revit', 'AI Rendering'].map((tool) => (
                  <label key={tool} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${formData.preferredTool === tool ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 shadow-sm' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                    <input
                      type="radio"
                      name="preferredTool"
                      value={tool}
                      checked={formData.preferredTool === tool}
                      onChange={() => setFormData({ ...formData, preferredTool: tool as any })}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                    />
                    <span className={`ml-3 text-sm font-medium ${formData.preferredTool === tool ? 'text-purple-700 dark:text-purple-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {tool}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-4">
                Select the primary software or AI tool you'd like us to use for this project.
              </p>
            </div>
          </div>


          {/* Section 4: Areas / Scopes */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">Areas & Scope Definition</h3>
              <span className="text-xs text-zinc-500">Define up to 3 areas</span>
            </div>

            <div className="space-y-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedArea(expandedArea === index + 1 ? null : index + 1)}
                    className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-900/50 text-purple-300 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-200">
                        {formData.areas[index].scope ? formData.areas[index].scope : `Area ${index + 1}`}
                      </span>
                    </div>
                    {expandedArea === index + 1 ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
                  </button>

                  {expandedArea === index + 1 && (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-medium text-zinc-400">Scope Name</label>
                        <input
                          type="text"
                          value={formData.areas[index].scope}
                          onChange={(e) => handleAreaChange(index, 'scope', e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none"
                          placeholder="e.g. Living Room Rendering"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400">Suggested Designer</label>
                        <input
                          type="text"
                          value={formData.areas[index].designer}
                          onChange={(e) => handleAreaChange(index, 'designer', e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none"
                          placeholder="Designer Name"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400">Target Date</label>
                        <input
                          type="date"
                          value={formData.areas[index].targetDate}
                          onChange={(e) => handleAreaChange(index, 'targetDate', e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-medium text-zinc-400">Task Description</label>
                        <textarea
                          rows={3}
                          value={formData.areas[index].description}
                          onChange={(e) => handleAreaChange(index, 'description', e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2 px-3 text-sm text-zinc-900 dark:text-white focus:border-purple-500 focus:outline-none"
                          placeholder="Specific requirements for this area..."
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-6">
            <div className="text-xs text-zinc-500">
              * Estimate: <span className="text-purple-400">~24h turnaround</span> for basic visualizations.
            </div>
            <button
              type="submit"
              className="bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 font-semibold py-3 px-8 rounded-lg flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
            >
              <Send size={18} />
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
