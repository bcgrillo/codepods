import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Download, Folder, FolderPlus, File as FileIcon, Loader2,
  MoreHorizontal, RefreshCw, Trash2, Upload, AlertCircle, Check, X, FileCode2,
} from 'lucide-react';
import {
  useWorkspaceFiles, useDeleteWorkspaceFile, useUploadWorkspaceFiles, useCreateWorkspaceFolder, useCopyAgentsMd,
} from '../../hooks/useWorkspaces';
import type { UploadOverwriteMode } from '@codepods/shared-types';
import { inputCls, inputCompactCls, secondaryBtnCls } from '../ui/styles';
import { PrimaryButton } from '../ui/buttons';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../ui/dropdown-menu';

interface WorkspaceFileManagerProps {
  workspaceId: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00A0B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}\u00A0KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}\u00A0MB`;
}

export function WorkspaceFileManager({ workspaceId }: WorkspaceFileManagerProps) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState('');
  const [overwrite, setOverwrite] = useState<UploadOverwriteMode>('error');
  // Files selected/dropped wait in this list until "Upload" is confirmed.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const { data: entries, isLoading, refetch } = useWorkspaceFiles(workspaceId, currentPath);
  const deleteFile = useDeleteWorkspaceFile();
  const uploadFiles = useUploadWorkspaceFiles();
  const createFolder = useCreateWorkspaceFolder();
  const copyAgentsMd = useCopyAgentsMd();
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const navigateTo = (dir: string) => {
    if (!dir) { setCurrentPath(''); return; }
    const parts = currentPath ? currentPath.split('/') : [];
    parts.push(dir);
    setCurrentPath(parts.join('/'));
    setUploadMsg(null);
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  const handleDownload = async (file: string) => {
    try {
      const { workspacesClient } = await import('../../hooks/useWorkspaces');
      const { blob, filename } = await workspacesClient.readFile(workspaceId, currentPath ? `${currentPath}/${file}` : file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  };

  const handleDelete = async (file: string) => {
    const fullPath = currentPath ? `${currentPath}/${file}` : file;
    try {
      await deleteFile.mutateAsync({ id: workspaceId, path: fullPath });
      setConfirmDelete(null);
    } catch (err: unknown) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  };

  // Select/drop → pending upload state (no immediate network call).
  const addPendingFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadMsg(null);
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const commitUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setUploadMsg(null);
    const files = pendingFiles;
    try {
      const result = await uploadFiles.mutateAsync({
        id: workspaceId,
        files,
        subPath: currentPath,
        overwrite,
      });
      const parts: string[] = [];
      if (result.written.length > 0) parts.push(`${result.written.length} ${t('workspaceFiles.uploaded')}`);
      if (result.overwritten.length > 0) parts.push(`${result.overwritten.length} ${t('workspaceFiles.backedUp')}`);
      setUploadMsg({ type: 'success', text: parts.join(', ') || t('workspaceFiles.uploadDone') });
      setPendingFiles([]);
    } catch (err: unknown) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  }, [pendingFiles, workspaceId, currentPath, overwrite, uploadFiles, t]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);
    addPendingFiles(e.dataTransfer.files);
  }, [addPendingFiles]);

  const handleCopyAgentsMd = async () => {
    setCopyMsg(null);
    try {
      const result = await copyAgentsMd.mutateAsync({ id: workspaceId });
      setCopyMsg(
        result.renamed
          ? t('agents.copyAgentsMdRenamed', { name: result.backupName })
          : t('agents.copyAgentsMdDone'),
      );
    } catch (err: unknown) {
      setCopyMsg(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setUploadMsg(null);
    const relPath = [currentPath, name].filter(Boolean).join('/');
    try {
      await createFolder.mutateAsync({ id: workspaceId, path: relPath });
      setNewFolderName('');
      setNewFolderOpen(false);
      setUploadMsg({ type: 'success', text: t('workspaceFiles.folderCreated') });
    } catch (err: unknown) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  };

  const compactBtn = '!py-0.5 !text-xs whitespace-nowrap';

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-xs">
        <button
          onClick={() => navigateTo('')}
          className="text-muted-foreground hover:text-foreground"
        >
          {t('workspaceFiles.root')}
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-muted-foreground/50">/</span>
            <button
              onClick={() => setCurrentPath(breadcrumbs.slice(0, i + 1).join('/'))}
              className="text-muted-foreground hover:text-foreground"
            >
              {part}
            </button>
          </span>
        ))}
        {currentPath && (
          <button onClick={navigateUp} className="ml-2 text-muted-foreground hover:text-foreground" title={t('workspaceFiles.up')}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => addPendingFiles(e.target.files)}
          className="hidden"
        />
        <PrimaryButton
          onClick={() => fileInputRef.current?.click()}
          className={compactBtn}
        >
          <Upload className="h-3.5 w-3.5" />
          {t('workspaceFiles.upload')}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => { setNewFolderOpen((v) => !v); setNewFolderName(''); }}
          className={cn(secondaryBtnCls, compactBtn)}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {t('workspaceFiles.newFolder')}
        </button>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(secondaryBtnCls, compactBtn, 'h-6 w-6 p-0 justify-center')}
                title={t('workspaceFiles.more')}
                aria-label={t('workspaceFiles.more')}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t('workspaceFiles.refresh')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCopyAgentsMd} disabled={copyAgentsMd.isPending}>
                {copyAgentsMd.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="h-3.5 w-3.5" />}
                {t('agents.copyAgentsMd')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pending upload list — files wait below the toolbar until confirmed */}
      {pendingFiles.length > 0 && (
        <div className="border-b border-border/60 bg-secondary-item/20 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              <Upload className="h-3 w-3" />
              {t('workspaceFiles.pendingFiles', { count: pendingFiles.length })}
            </span>
            <button
              type="button"
              onClick={() => setPendingFiles([])}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              title={t('workspaceFiles.clearPending')}
            >
              <X className="h-3 w-3" />
              {t('workspaceFiles.clearPending')}
            </button>
          </div>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto pr-1">
            {pendingFiles.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded bg-background/60 px-2 py-1 text-xs">
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-foreground" title={file.name}>{file.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground/70">{formatSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title={t('workspaceFiles.clearPending')}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <PrimaryButton
              onClick={commitUpload}
              disabled={uploadFiles.isPending}
              className={compactBtn}
            >
              {uploadFiles.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {uploadFiles.isPending ? t('workspaceFiles.uploading') : t('workspaceFiles.uploadPending', { count: pendingFiles.length })}
            </PrimaryButton>
            <select
              value={overwrite}
              onChange={(e) => setOverwrite(e.target.value as UploadOverwriteMode)}
              className={`${inputCls} !py-0.5 !text-xs !w-auto`}
              title={t('workspaceFiles.overwriteMode')}
            >
              <option value="error">{t('workspaceFiles.overwriteError')}</option>
              <option value="replace">{t('workspaceFiles.overwriteReplace')}</option>
              <option value="backup">{t('workspaceFiles.overwriteBackup')}</option>
            </select>
          </div>
        </div>
      )}

      {/* New folder inline form */}
      {newFolderOpen && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <FolderPlus className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName(''); }
            }}
            placeholder={t('workspaceFiles.folderName')}
            className={`${inputCompactCls} flex-1 !py-1 !text-xs`}
          />
          <button
            type="button"
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim() || createFolder.isPending}
            className="p-1 text-primary hover:text-primary-soft disabled:opacity-40"
            title={t('workspaceFiles.createFolder')}
          >
            {createFolder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}
            className="p-1 text-muted-foreground hover:text-foreground"
            title={t('workspaceFiles.cancel')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {uploadMsg && (
        <div className={`flex items-center gap-1.5 px-3 py-1 text-xs ${uploadMsg.type === 'error' ? 'text-destructive' : 'text-emerald-500'}`}>
          {uploadMsg.type === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
          {uploadMsg.text}
        </div>
      )}
      {copyMsg && (
        <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-emerald-500">
          <Check className="h-3.5 w-3.5" />
          {copyMsg}
        </div>
      )}

      {/* File list (drop target) */}
      <div
        className="relative flex-1 overflow-y-auto"
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !entries || entries.length === 0 ? (
          !isDragging && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="m-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border py-8 text-center transition-colors hover:border-primary/60 hover:bg-secondary-item/20"
            >
              <Upload className="h-5 w-5 text-muted-foreground/60" />
              <p className="px-4 text-xs text-muted-foreground/60">{t('workspaceFiles.uploadHint')}</p>
            </div>
          )
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  className="border-b border-border/50 hover:bg-secondary-item/30"
                >
                  <td className="py-1.5 pl-3 pr-2">
                    <div className="flex items-center gap-2">
                      {entry.type === 'dir' ? (
                        <Folder className="h-4 w-4 flex-shrink-0 text-primary" />
                      ) : (
                        <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      {entry.type === 'dir' ? (
                        <button
                          onClick={() => navigateTo(entry.name)}
                          className="text-foreground hover:text-primary hover:underline"
                        >
                          {entry.name}
                        </button>
                      ) : (
                        <span className="text-foreground">{entry.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-right text-muted-foreground w-24">
                    {entry.type === 'file' ? formatSize(entry.size) : '\u2014'}
                  </td>
                  <td className="py-1.5 px-2 text-right text-muted-foreground/50 w-32">
                    {new Date(entry.modified).toLocaleDateString()}
                  </td>
                  <td className="py-1.5 px-3 text-right w-20">
                    {entry.type === 'file' && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDownload(entry.name)}
                          className="p-1 text-muted-foreground hover:text-primary"
                          title={t('common.download')}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {confirmDelete === entry.name ? (
                          <button
                            onClick={() => handleDelete(entry.name)}
                            className="p-1 text-destructive hover:text-red-300"
                            title={t('common.confirm')}
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(entry.name)}
                            className="p-1 text-muted-foreground hover:text-destructive"
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Drag overlay */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-primary bg-panel-background/90 text-center">
            <Upload className="h-6 w-6 text-primary" />
            <p className="text-xs font-medium text-primary">{t('workspaceFiles.dropHere')}</p>
          </div>
        )}
      </div>

      {/* Footer drop hint */}
      {!isDragging && (
        <div className="flex items-center gap-1.5 border-t border-border/50 px-3 py-1 text-[11px] text-muted-foreground/60">
          <Upload className="h-3 w-3" />
          <span>{t('workspaceFiles.dragDropHint')}</span>
        </div>
      )}
    </div>
  );
}
