/**
 * Incident Correlation Tests - P17
 */
import {
  generateCorrelationKey,
  extractReasons,
  extractComponents,
  determineSeverity,
  buildCorrelationInput,
  keysMatch,
  correlationSummary,
} from '../../src/proxy-mcp/ops/incidents/correlate';

describe('generateCorrelationKey', () => {
  it('should generate consistent keys for same input', () => {
    const input = {
      severity: 'critical' as const,
      reasons: ['timeout', 'connection refused'],
      components: ['api-gateway', 'database'],
    };

    const key1 = generateCorrelationKey(input);
    const key2 = generateCorrelationKey(input);

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(16);
  });

  it('should generate different keys for different severities', () => {
    const base = {
      reasons: ['error'],
      components: ['service'],
    };

    const criticalKey = generateCorrelationKey({
      ...base,
      severity: 'critical',
    });
    const warnKey = generateCorrelationKey({ ...base, severity: 'warn' });

    expect(criticalKey).not.toBe(warnKey);
  });

  it('should generate different keys for different reasons', () => {
    const base = {
      severity: 'critical' as const,
      components: ['service'],
    };

    const key1 = generateCorrelationKey({ ...base, reasons: ['timeout'] });
    const key2 = generateCorrelationKey({ ...base, reasons: ['memory'] });

    expect(key1).not.toBe(key2);
  });

  it('should generate same key regardless of reason order', () => {
    const base = {
      severity: 'critical' as const,
      components: ['service'],
    };

    const key1 = generateCorrelationKey({
      ...base,
      reasons: ['timeout', 'memory'],
    });
    const key2 = generateCorrelationKey({
      ...base,
      reasons: ['memory', 'timeout'],
    });

    expect(key1).toBe(key2);
  });

  it('should respect maxReasonsForKey config', () => {
    const input = {
      severity: 'critical' as const,
      reasons: ['a', 'b', 'c', 'd', 'e'],
      components: ['service'],
    };

    const key1 = generateCorrelationKey(input, { maxReasonsForKey: 2 });
    const key2 = generateCorrelationKey(
      { ...input, reasons: ['a', 'b', 'x', 'y', 'z'] },
      { maxReasonsForKey: 2 }
    );

    // First 2 reasons are same, so keys should match
    expect(key1).toBe(key2);
  });

  it('should handle empty inputs', () => {
    const key = generateCorrelationKey({
      severity: 'info',
      reasons: [],
      components: [],
    });

    expect(key).toHaveLength(16);
  });
});

describe('extractReasons', () => {
  it('should extract from array', () => {
    const result = extractReasons(['error1', 'error2']);
    expect(result).toEqual(['error1', 'error2']);
  });

  it('should extract from comma-separated string', () => {
    const result = extractReasons('error1, error2, error3');
    expect(result).toEqual(['error1', 'error2', 'error3']);
  });

  it('should extract from object with reasons field', () => {
    const result = extractReasons({ reasons: ['error1', 'error2'] });
    expect(result).toEqual(['error1', 'error2']);
  });

  it('should return empty for null/undefined', () => {
    expect(extractReasons(null)).toEqual([]);
    expect(extractReasons(undefined)).toEqual([]);
  });
});

describe('extractComponents', () => {
  it('should extract from array', () => {
    const result = extractComponents(['api', 'db']);
    expect(result).toEqual(['api', 'db']);
  });

  it('should extract from object with components field', () => {
    const result = extractComponents({ components: ['api', 'db'] });
    expect(result).toEqual(['api', 'db']);
  });

  it('should extract from object with services field', () => {
    const result = extractComponents({ services: ['api', 'db'] });
    expect(result).toEqual(['api', 'db']);
  });
});

describe('determineSeverity', () => {
  it('should detect critical from string', () => {
    expect(determineSeverity('critical')).toBe('critical');
    expect(determineSeverity('CRITICAL')).toBe('critical');
    expect(determineSeverity('error occurred')).toBe('critical');
    expect(determineSeverity('fatal error')).toBe('critical');
  });

  it('should detect warn from string', () => {
    expect(determineSeverity('warn')).toBe('warn');
    expect(determineSeverity('WARNING')).toBe('warn');
  });

  it('should detect ok from string', () => {
    expect(determineSeverity('ok')).toBe('ok');
    expect(determineSeverity('resolved')).toBe('ok');
    expect(determineSeverity('success')).toBe('ok');
  });

  it('should detect from object severity field', () => {
    expect(determineSeverity({ severity: 'critical' })).toBe('critical');
    expect(determineSeverity({ level: 'warn' })).toBe('warn');
  });

  it('should default to info', () => {
    expect(determineSeverity('unknown')).toBe('info');
    expect(determineSeverity({})).toBe('info');
  });
});

describe('buildCorrelationInput', () => {
  it('should build from partial data', () => {
    const result = buildCorrelationInput({
      severity: 'critical',
      reasons: ['timeout'],
      components: ['api'],
    });

    expect(result.severity).toBe('critical');
    expect(result.reasons).toEqual(['timeout']);
    expect(result.components).toEqual(['api']);
  });

  it('should handle string severity', () => {
    const result = buildCorrelationInput({
      severity: 'error detected',
    });

    expect(result.severity).toBe('critical');
  });

  it('should default to info severity', () => {
    const result = buildCorrelationInput({});
    expect(result.severity).toBe('info');
  });
});

describe('keysMatch', () => {
  it('should return true for matching keys', () => {
    expect(keysMatch('abc123', 'abc123')).toBe(true);
  });

  it('should return false for non-matching keys', () => {
    expect(keysMatch('abc123', 'xyz789')).toBe(false);
  });
});

describe('correlationSummary', () => {
  it('should generate readable summary', () => {
    const summary = correlationSummary({
      severity: 'critical',
      reasons: ['timeout', 'connection refused'],
      components: ['api-gateway'],
    });

    expect(summary).toContain('[CRITICAL]');
    expect(summary).toContain('timeout');
    expect(summary).toContain('api-gateway');
  });

  it('should handle empty reasons/components', () => {
    const summary = correlationSummary({
      severity: 'info',
      reasons: [],
      components: [],
    });

    expect(summary).toContain('[INFO]');
  });
});
