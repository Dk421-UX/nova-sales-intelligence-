import React, { useState } from 'react';
import { Project } from '../../types/models.ts';
import { api } from '../../services/api.ts';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Settings, Check, RefreshCw } from 'lucide-react';

interface ExcelImportWizardProps {
  project: Project;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ExcelImportWizard: React.FC<ExcelImportWizardProps> = ({
  project,
  onClose,
  onImportComplete
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [preview, setPreview] = useState<any | null>(null);
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [customMapping, setCustomMapping] = useState<any>({});
  const [skipInvalidRows, setSkipInvalidRows] = useState(false);
  const [rowActions, setRowActions] = useState<Record<number, { action: 'SKIP' | 'SET_STATUS'; status?: string }>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setErrorMsg('');
    setIsLoading(true);

    try {
      const res = await api.uploadExcelForSheets(selected);
      setSheets(res.sheets || []);
      
      // Auto-select sheet matching project name if possible
      const matchingSheet = (res.sheets || []).find((s: string) => 
        s.toLowerCase().includes(project.name.toLowerCase().replace('nova ', ''))
      ) || res.sheets?.[0] || '';
      
      setSelectedSheet(matchingSheet);
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to inspect Excel workbook.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePreview = async (mappingOverrides?: any) => {
    if (!file || !selectedSheet) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const previewData = await api.generateExcelPreview(
        file, 
        project.id, 
        selectedSheet,
        mappingOverrides !== undefined ? mappingOverrides : customMapping
      );
      setPreview(previewData);
      setRowActions({});
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse Excel rows.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyImport = async () => {
    if (!preview?.importId) return;

    setIsApplying(true);
    setErrorMsg('');

    try {
      const res = await api.applyExcelImport(preview.importId, {
        skipInvalid: skipInvalidRows,
        rowActions
      });
      alert(res.message || 'Import applied successfully.');
      onImportComplete();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to apply import.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '920px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <FileSpreadsheet size={20} color="var(--brand-gold)" />
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>
              Excel Inventory Importer & Governance Pipeline
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {errorMsg && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
              {errorMsg}
            </div>
          )}

          {/* Stepper Header */}
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: step >= 1 ? 'var(--brand-gold)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>1. Upload File</span>
            </div>
            <ArrowRight size={14} color="var(--text-muted)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: step >= 2 ? 'var(--brand-gold)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>2. Select Sheet</span>
            </div>
            <ArrowRight size={14} color="var(--text-muted)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: step >= 3 ? 'var(--brand-gold)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>3. Preview & Apply</span>
            </div>
          </div>

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div style={{ border: '2px dashed var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-surface-raised)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <UploadCloud size={48} color="var(--brand-gold)" />
              <div>
                <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.35rem' }}>Upload Inventory Excel Workbook</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Supports .xlsx, .xls files with multiple project sheets
                </p>
              </div>

              <label className="btn btn-primary" style={{ cursor: 'pointer', marginTop: '0.5rem' }}>
                <FileSpreadsheet size={16} /> Choose Excel File
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}

          {/* STEP 2: Select Sheet */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Target Project</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{project.name} ({project.project_type})</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Select Sheet from Workbook ({sheets.length} sheets found)
                </label>
                <select
                  value={selectedSheet}
                  onChange={e => setSelectedSheet(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem' }}
                >
                  {sheets.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="btn btn-primary" onClick={() => handleGeneratePreview()} disabled={isLoading || !selectedSheet}>
                  {isLoading ? 'Inspecting Rows...' : 'Generate Diff Preview'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview & Apply */}
          {step === 3 && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Column Mapping Preview Banner */}
              <div style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                    Detected Column Mapping ({preview.detectedMapping?.length || 0} columns)
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => setShowMappingEditor(!showMappingEditor)}
                  >
                    <Settings size={12} /> {showMappingEditor ? 'Hide Mapping' : 'Review / Edit Mapping'}
                  </button>
                </div>

                {showMappingEditor ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                    {preview.detectedMapping?.map((m: any, idx: number) => (
                      <div key={idx} style={{ background: 'var(--bg-surface)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600 }}>Excel: "{m.excelHeader}"</div>
                        <div style={{ fontSize: '0.8rem', color: '#fff', marginTop: '0.2rem' }}>
                          Target Field: <strong>{m.targetField}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem' }}>
                    {preview.detectedMapping?.map((m: any, idx: number) => (
                      <span key={idx} style={{ background: 'var(--bg-surface)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: '#fff' }}>{m.excelHeader}</strong> → <span style={{ color: 'var(--brand-gold)' }}>{m.targetField}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Invalid Rows Action Card */}
              {preview.summary.invalidCount > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1.5px solid rgba(239, 68, 68, 0.4)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <AlertCircle size={20} color="#ef4444" />
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ef4444' }}>
                          Action Required: {preview.summary.invalidCount} Row(s) Contain Unsupported Statuses / Values
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          For example, on-site reservations like "Clubhouse" cannot be directly recorded as sale inventory. You can skip these rows or map their status below.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className={`btn btn-sm ${skipInvalidRows ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => setSkipInvalidRows(!skipInvalidRows)}
                      >
                        {skipInvalidRows ? '✓ Skipping Invalid Rows' : 'Skip All Invalid Rows'}
                      </button>
                    </div>
                  </div>

                  {/* List of specific invalid rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {preview.rows.filter((r: any) => r.changeType === 'INVALID').map((inv: any, idx: number) => {
                      const detail = inv.errorDetails;
                      const action = rowActions[inv.rowIndex];

                      return (
                        <div key={idx} style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                              Row {inv.rowIndex}: Plot {inv.propertyNumber} • Column: {detail?.excelColumn || 'Status'} • Value: <code style={{ color: '#ef4444' }}>"{detail?.originalValue || inv.status}"</code>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                              {detail?.problem || inv.validationError} ({detail?.possibleCause})
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <select
                              value={action?.action === 'SET_STATUS' ? action.status : (action?.action === 'SKIP' ? 'SKIP' : '')}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'SKIP') {
                                  setRowActions(prev => ({ ...prev, [inv.rowIndex]: { action: 'SKIP' } }));
                                } else if (val) {
                                  setRowActions(prev => ({ ...prev, [inv.rowIndex]: { action: 'SET_STATUS', status: val } }));
                                } else {
                                  const copy = { ...rowActions };
                                  delete copy[inv.rowIndex];
                                  setRowActions(copy);
                                }
                              }}
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem', background: 'var(--bg-surface-raised)', color: '#fff' }}
                            >
                              <option value="">Choose Action...</option>
                              <option value="SKIP">Skip This Row</option>
                              <option value="RESERVED">Map Status to: RESERVED</option>
                              <option value="BLOCKED">Map Status to: BLOCKED</option>
                              <option value="AVAILABLE">Map Status to: AVAILABLE</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(110px, 1fr))`, gap: '0.75rem' }}>
                <div style={{ background: 'var(--bg-surface-raised)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{preview.summary.totalRows}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Rows</div>
                </div>

                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--status-available)' }}>{preview.summary.newCount}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--status-available)', textTransform: 'uppercase' }}>New</div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--status-booked)' }}>{preview.summary.statusChangeCount}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--status-booked)', textTransform: 'uppercase' }}>Status Changes</div>
                </div>

                <div style={{ background: 'var(--bg-surface-raised)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{preview.summary.unchangedCount}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unchanged</div>
                </div>

                {(preview.summary.conflictCount > 0) && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{preview.summary.conflictCount}</div>
                    <div style={{ fontSize: '0.68rem', color: '#ef4444', textTransform: 'uppercase' }}>Conflicts</div>
                  </div>
                )}

                {preview.summary.missingCount > 0 && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-gold)' }}>{preview.summary.missingCount}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--brand-gold)', textTransform: 'uppercase' }}>Missing Rows</div>
                  </div>
                )}

                {preview.summary.duplicateCount > 0 && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{preview.summary.duplicateCount}</div>
                    <div style={{ fontSize: '0.68rem', color: '#ef4444', textTransform: 'uppercase' }}>Duplicates</div>
                  </div>
                )}

                {preview.summary.invalidCount > 0 && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.18)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.5)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{preview.summary.invalidCount}</div>
                    <div style={{ fontSize: '0.68rem', color: '#ef4444', textTransform: 'uppercase' }}>Invalid Rows</div>
                  </div>
                )}
              </div>

              {/* Rows Table */}
              <div className="table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Property No</th>
                      <th>Status</th>
                      <th>Facing</th>
                      <th>Area (sq.ft)</th>
                      <th>Change Type & Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r: any, idx: number) => {
                      const rowAction = rowActions[r.rowIndex];
                      const isSkipped = rowAction?.action === 'SKIP' || (r.changeType === 'INVALID' && skipInvalidRows);
                      const isOverridden = rowAction?.action === 'SET_STATUS';

                      return (
                        <tr 
                          key={idx} 
                          style={{ 
                            opacity: isSkipped ? 0.45 : 1,
                            background: r.changeType === 'DUPLICATE' || r.changeType === 'INVALID' || r.changeType === 'CONFLICT' 
                              ? 'rgba(239, 68, 68, 0.08)' 
                              : (r.changeType === 'NEW' ? 'rgba(16, 185, 129, 0.08)' : (r.changeType === 'MISSING' ? 'rgba(245, 158, 11, 0.08)' : undefined)) 
                          }}
                        >
                          <td style={{ color: 'var(--text-muted)' }}>{r.rowIndex === -1 ? 'DB Only' : r.rowIndex}</td>
                          <td style={{ fontWeight: 700, color: '#fff' }}>{r.propertyNumber}</td>
                          <td>
                            <span className={`badge badge-${(isOverridden ? rowAction.status : r.status).toLowerCase()}`}>
                              {isOverridden ? `${rowAction.status} (override)` : r.status}
                            </span>
                          </td>
                          <td>{r.facing || '—'}</td>
                          <td>{r.areaSqft || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span 
                                className="badge"
                                style={{
                                  display: 'inline-block',
                                  width: 'fit-content',
                                  background: isSkipped ? 'rgba(100, 116, 139, 0.3)' : (r.changeType === 'NEW' ? 'rgba(16, 185, 129, 0.2)' : (r.changeType === 'STATUS_CHANGE' ? 'rgba(245, 158, 11, 0.2)' : (r.changeType === 'DUPLICATE' || r.changeType === 'INVALID' || r.changeType === 'CONFLICT' ? 'rgba(239, 68, 68, 0.2)' : (r.changeType === 'MISSING' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(100, 116, 139, 0.2)')))),
                                  color: isSkipped ? 'var(--text-muted)' : (r.changeType === 'NEW' ? 'var(--status-available)' : (r.changeType === 'STATUS_CHANGE' ? 'var(--status-booked)' : (r.changeType === 'DUPLICATE' || r.changeType === 'INVALID' || r.changeType === 'CONFLICT' ? '#ef4444' : (r.changeType === 'MISSING' ? 'var(--brand-gold)' : 'var(--text-muted)'))))
                                }}
                              >
                                {isSkipped ? 'SKIPPED' : (isOverridden ? 'STATUS OVERRIDE' : r.changeType)}
                              </span>
                              {r.validationError && !isSkipped && (
                                <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>
                                  {r.validationError}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)}>
                  Back to Sheet Selection
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={handleApplyImport}
                  disabled={isApplying || preview.summary.totalRows === 0}
                >
                  <CheckCircle2 size={16} /> {isApplying ? 'Applying Verified Import...' : `Apply Import (${preview.summary.newCount + preview.summary.statusChangeCount + preview.summary.updatedCount} Valid Records)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
