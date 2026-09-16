import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBuildStore } from './buildStore';

const mocks = vi.hoisted(() => ({
  ensureImageTemplateStream: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('../hooks/useAgents', () => ({
  agentsClient: { ensureImageTemplateStream: mocks.ensureImageTemplateStream },
}));

vi.mock('../lib/queryClient', () => ({
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));

describe('useBuildStore', () => {
  beforeEach(() => {
    useBuildStore.setState({ builds: {} });
    vi.clearAllMocks();
  });

  it('marks a build as in progress and captures streamed output', async () => {
    mocks.ensureImageTemplateStream.mockImplementation(async (_id, _update, onLine) => {
      onLine('line-1');
      onLine('line-2');
      return { action: 'built' };
    });

    await useBuildStore.getState().startBuild(1, false);

    const st = useBuildStore.getState();
    expect(st.builds[1].isBuilding).toBe(false);
    expect(st.builds[1].output).toEqual(['line-1', 'line-2']);
    expect(st.builds[1].action).toBe('built');
    expect(st.builds[1].error).toBeNull();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['image-templates'] });
  });

  it('does not restart a build already in progress', async () => {
    useBuildStore.setState({
      builds: { 1: { isBuilding: true, output: [], error: null, action: null } },
    });
    mocks.ensureImageTemplateStream.mockResolvedValue({ action: 'built' });
    await useBuildStore.getState().startBuild(1, false);
    expect(mocks.ensureImageTemplateStream).not.toHaveBeenCalled();
  });

  it('records an error and streamed output on failure', async () => {
    mocks.ensureImageTemplateStream.mockRejectedValue(
      new Error('API error: {"code":"E","message":"build failed","buildOutput":["oops"]}'),
    );
    await useBuildStore.getState().startBuild(2, true);

    const st = useBuildStore.getState();
    expect(st.builds[2].error).toBe('build failed');
    expect(st.builds[2].output).toEqual(['oops']);
    expect(st.builds[2].isBuilding).toBe(false);
  });

  it('falls back to the raw error message when payload is not parseable', async () => {
    mocks.ensureImageTemplateStream.mockRejectedValue(new Error('plain error'));
    await useBuildStore.getState().startBuild(3, false);
    expect(useBuildStore.getState().builds[3].error).toBe('plain error');
  });

  it('clearBuild removes the build entry', async () => {
    useBuildStore.setState({
      builds: { 1: { isBuilding: false, output: [], error: null, action: 'built' } },
    });
    useBuildStore.getState().clearBuild(1);
    expect(useBuildStore.getState().builds).toEqual({});
  });
});
