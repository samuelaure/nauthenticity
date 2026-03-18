import { PHASE_LABELS, PipelineStepName } from '../compute.worker';

describe('Pipeline/Phase Integration', () => {
  it('should map each step to a unique phase label', () => {
    const labels = Object.values(PHASE_LABELS);
    const uniqueLabels = new Set(labels);

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBe(uniqueLabels.size);
  });

  it('should allow reverse lookup for resume logic', () => {
    const findStep = (phase: string): PipelineStepName | undefined => {
      return (Object.keys(PHASE_LABELS) as PipelineStepName[]).find(
        (key) => PHASE_LABELS[key] === phase,
      );
    };

    expect(findStep('visualizing')).toBe('visualize-batch');
    expect(findStep('transcribing')).toBe('transcribe-batch');
    expect(findStep('non-existent')).toBeUndefined();
  });
});
