import React, { useState, useEffect } from 'react';
import axios from 'axios';
import mammoth from 'mammoth';
import { 
  FileText, 
  Upload, 
  Download, 
  Check, 
  AlertCircle, 
  Zap,
  ArrowRight,
  FileCheck,
  Edit3
} from 'lucide-react';
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5001';
function App() {
  const [file, setFile] = useState(null);
  const [placeholders, setPlaceholders] = useState([]);
  const [values, setValues] = useState({});
  const [step, setStep] = useState(1);
  const [outputFormat, setOutputFormat] = useState('docx');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [docPreview, setDocPreview] = useState(''); // HTML preview for docx

  useEffect(() => {
    // Fetch template list from backend
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await axios.get(`${API_BASE}/api/templates`);
        setTemplates(res.data.templates);
        setLoading(false);
      } catch (error) {
        setError('Failed to load templates');
        setLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);

  const handleTemplateSelect = async (e) => {
    const filename = e.target.value;
    setSelectedTemplate(filename);
    setFile(null);
    setStep(1);
    setPlaceholders([]);
    setValues({});
    setLoading(true);
    setError(null);
    setDocPreview('');

    try {
      // Fetch template file from backend
      const res = await axios.get(`${API_BASE}/api/template/${filename}`, { 
        responseType: 'blob' 
      });
      
      const fileType = filename.endsWith('.pdf') 
        ? 'application/pdf' 
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const templateFile = new File([res.data], filename, { type: fileType });
      
      setFile(templateFile);

      // If DOCX, generate HTML preview via mammoth
      if (fileType.includes('wordprocessingml.document')) {
        try {
          const arrayBuffer = await templateFile.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setDocPreview(result.value || '');
        } catch (mErr) {
          console.warn('Mammoth preview failed:', mErr);
          setDocPreview('');
        }
      }
      setLoading(false);
    } catch (error) {
      setError('Failed to load template file');
      setLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    setFile(selectedFile || null);
    setStep(1);
    setPlaceholders([]);
    setValues({});
    setSelectedTemplate('');
    setError(null);
    setDocPreview('');

    if (selectedFile && (selectedFile.type.includes('wordprocessingml.document') || selectedFile.name.endsWith('.docx'))) {
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setDocPreview(result.value || '');
      } catch (mErr) {
        console.warn('Mammoth preview failed for uploaded file:', mErr);
        setDocPreview('');
      }
    }
  };

  const uploadFile = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('template', file);
      const res = await axios.post(`${API_BASE}/api/upload`, formData);
      
      setPlaceholders(res.data.placeholders);
      setStep(2);
      setLoading(false);
    } catch (error) {
      setError('Failed to process template file');
      setLoading(false);
    }
  };

  const handleValueChange = (key, value) => {
    setValues({ ...values, [key]: value });
  };

  const generateDocument = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('template', file);
      formData.append('values', JSON.stringify(values));
      formData.append('outputFormat', outputFormat);
      
      const res = await axios.post(`${API_BASE}/api/generate`, formData, { 
        responseType: 'blob' 
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 
        outputFormat === 'pdf' ? 'contract.pdf' : 'contract.docx'
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setLoading(false);
    } catch (error) {
      setError('Failed to generate document');
      setLoading(false);
    }
  };

  const getStepIcon = (stepNumber) => {
    if (step > stepNumber) return <Check className="w-5 h-5 text-white" />;
    return <span className="text-sm font-semibold">{stepNumber}</span>;
  };

  const getStepClass = (stepNumber) => {
    if (step > stepNumber) return "bg-green-500 border-green-500";
    if (step === stepNumber) return "bg-blue-500 border-blue-500 text-white";
    return "bg-gray-100 border-gray-300 text-gray-400";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-teal-500 rounded-2xl mb-6">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Contract Template Editor
          </h1>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center space-x-4">
            {/* Step 1 */}
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${getStepClass(1)}`}>
                {getStepIcon(1)}
              </div>
              <span className="ml-3 font-medium text-gray-700">Upload Template</span>
            </div>
            
            <ArrowRight className="w-5 h-5 text-gray-400" />
            
            {/* Step 2 */}
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${getStepClass(2)}`}>
                {getStepIcon(2)}
              </div>
              <span className="ml-3 font-medium text-gray-700">Fill Placeholders</span>
            </div>
            
            <ArrowRight className="w-5 h-5 text-gray-400" />
            
            {/* Step 3 */}
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${getStepClass(3)}`}>
                {getStepIcon(3)}
              </div>
              <span className="ml-3 font-medium text-gray-700">Generate</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            
            {/* Step 1: Template Selection */}
            {step === 1 && (
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Choose Your Template
                  </h2>
                  <p className="text-gray-600">
                    Select from our pre-made templates or upload your own document
                  </p>
                </div>

                {/* Template Selection */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      <FileCheck className="w-4 h-4 inline mr-2" />
                      Select a stored template
                    </label>
                    <select 
                      value={selectedTemplate} 
                      onChange={handleTemplateSelect}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900"
                      disabled={loading}
                    >
                      <option value="">-- Choose a template --</option>
                      {templates.map(template => (
                        <option key={template} value={template}>{template}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">or</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      <Upload className="w-4 h-4 inline mr-2" />
                      Upload your own template
                    </label>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept=".docx,.pdf" 
                        onChange={handleFileChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                {file && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2">Template Preview:</h3>
                    {file.type === 'application/pdf' ? (
                      <iframe
                        src={URL.createObjectURL(file)}
                        title="PDF Preview"
                        width="100%"
                        height="480"
                        className="border rounded"
                      />
                    ) : (
                      <div
                        className="p-4 border rounded bg-white prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: docPreview || '<div class="text-gray-500">No preview available</div>' }}
                      />
                    )}
                  </div>
                )}

                {/* Action Button */}
                {file && (
                  <div className="flex justify-center pt-4">
                    <button 
                      onClick={uploadFile}
                      disabled={loading}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-teal-500 text-white font-medium rounded-xl hover:from-blue-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Detect Placeholders
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Fill Placeholders */}
            {step === 2 && (
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Fill in the Details
                  </h2>
                  <p className="text-gray-600">
                    Enter values for the placeholders found in your template
                  </p>
                </div>

                {placeholders.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No placeholders found in this template.</p>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2">
                    {placeholders.map((placeholder) => (
                      <div key={placeholder} className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          <Edit3 className="w-3 h-3 inline mr-1" />
                          {placeholder}
                        </label>
                        <input 
                          type="text" 
                          value={values[placeholder] || ''} 
                          onChange={(e) => handleValueChange(placeholder, e.target.value)}
                          placeholder={`Enter ${placeholder}`}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* Output format selector */}
<div className="flex items-center justify-center gap-4">
  <label className="text-sm text-gray-600">Output:</label>
  <select
    value={outputFormat}
    onChange={(e) => setOutputFormat(e.target.value)}
    className="px-3 py-2 border border-gray-300 rounded-xl"
  >
    <option value="docx">Word (.docx)</option>
    <option value="pdf">PDF (.pdf)</option>
  </select>
</div>


                {/* Action Button */}
                <div className="flex justify-center pt-4">
                  <button 
                    onClick={generateDocument}
                    disabled={loading || placeholders.length === 0}
                    className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-green-500 to-teal-500 text-white font-medium rounded-xl hover:from-green-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                        Generating Document...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5 mr-3" />
                        Generate & Download
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
