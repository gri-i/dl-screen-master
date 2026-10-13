import { describe, expect, it } from 'vitest';
import type { CabinetPreset, Processor, ProcessorPort, SignalFormat } from '../../src/shared/types';
import {
  checkControllerCanvas,
  checkControllerPorts,
  checkReceiverCard,
  checkSendingCardCount,
  controllerLimit,
  receiverLimit
} from '../../src/shared/hardwareLimits';

const signal = (bitDepth: SignalFormat['bitDepth']): SignalFormat => ({ bitDepth, frameRateHz: 60 });

function ports(model: string, cardCount: number, assignedPerPort = 0, maxPortsPerCard = 16): ProcessorPort[] {
  return Array.from({ length: cardCount * maxPortsPerCard }, (_, index) => {
    const card = Math.floor(index / maxPortsPerCard) + 1;
    const port = (index % maxPortsPerCard) + 1;
    return {
      portId: `${model} ${card}/${port}`,
      controllerId: String(card),
      controllerName: model,
      sourcePortName: String(port),
      maxPixels: 650_000,
      assignedCabinets: Array.from({ length: assignedPerPort }, (_, cabinet) => `${index}-${cabinet}`)
    };
  });
}

function processor(model: string, cardCount = 1, assignedPerPort = 0): Processor {
  return { id: `test-${model}`, brand: 'NovaStar', model, ports: ports(model, cardCount, assignedPerPort) };
}

function preset(receiverCardName: string, resolutionX: number, resolutionY: number): CabinetPreset {
  return {
    id: `test-${receiverCardName}`,
    brand: 'Test',
    model: 'Cabinet',
    widthMm: 500,
    heightMm: 500,
    pixelPitchMm: 2.5,
    resolutionX,
    resolutionY,
    weightKg: 1,
    maxPowerW: 100,
    avgPowerW: 40,
    receiverCardName
  };
}

describe('controller hardware limits', () => {
  it('normalizes controller names without confusing MCTRL660 and MCTRL660 Pro', () => {
    expect(controllerLimit(' MCTRL-660 PRO ' )?.model).toBe('MCTRL660 PRO');
    expect(controllerLimit('MCTRL 660')?.model).toBe('MCTRL660');
    expect(controllerLimit('MCTRL 660 PRO')?.model).not.toBe('MCTRL660');
  });

  it('checks known canvas boundaries inclusively', () => {
    const known = processor('MCTRL4K', 1, 0);
    known.ports[0].assignedCabinets = ['one'];
    expect(checkControllerCanvas(known, 8_800_000)[0]).toMatchObject({ status: 'ok', ok: true, limit: 8_800_000 });

    const over = processor('MCTRL4K', 1, 0);
    over.ports[0].assignedCabinets = ['one', 'two'];
    expect(checkControllerCanvas(over, 4_400_001)[0]).toMatchObject({ status: 'overload', ok: false });

    const depthSpecific = processor('MCTRL660', 1, 0);
    depthSpecific.ports[0].assignedCabinets = ['one'];
    expect(checkControllerCanvas(depthSpecific, 2_304_000, signal(8))[0]).toMatchObject({ status: 'ok', limit: 2_304_000 });
    expect(checkControllerCanvas(depthSpecific, 1, signal(10))[0]).toMatchObject({ status: 'unknown', ok: false });
  });

  it('checks a known canvas per sending card instead of combining independent units', () => {
    const twoControllers = processor('MCTRL660', 2, 0);
    twoControllers.ports[0].assignedCabinets = ['cabinet-1'];
    twoControllers.ports[16].assignedCabinets = ['cabinet-2'];
    const checks = checkControllerCanvas(twoControllers, 2_304_000, signal(8));
    expect(checks).toHaveLength(2);
    expect(checks.every((check) => check.status === 'ok')).toBe(true);
  });

  it('does not invent an aggregate canvas for modular H-series', () => {
    const result = checkControllerCanvas(processor('H9', 5), 1_000_000)[0];
    expect(result).toMatchObject({ status: 'unknown', ok: false });
    expect(result.limit).toBeUndefined();
    expect(result.reason).toContain('chassis variant');
  });

  it('keeps H15 standard/enhanced card boundaries explicit', () => {
    expect(checkSendingCardCount(processor('H15', 10))[0]).toMatchObject({ status: 'ok', ok: true, limit: 10 });
    expect(checkSendingCardCount(processor('H15', 11))[0]).toMatchObject({ status: 'unknown', ok: false, limit: 16 });
    expect(checkSendingCardCount(processor('H15', 17))[0]).toMatchObject({ status: 'overload', ok: false, limit: 16 });
    expect(checkSendingCardCount(processor('H9', 6))[0]).toMatchObject({ status: 'overload', ok: false, limit: 5 });
  });

  it('reports depth-specific port capacity and unknown depth honestly', () => {
    const h9 = processor('H9', 1, 1);
    expect(checkControllerPorts(h9, 650_000, signal(8))[0]).toMatchObject({ status: 'ok', limit: 650_000 });
    expect(checkControllerPorts(h9, 320_001, signal(10))[0]).toMatchObject({ status: 'overload', limit: 320_000 });
    expect(checkControllerPorts(h9, 1, signal(12))[0]).toMatchObject({ status: 'unknown', ok: false });

    const imported = processor('Sending card 1', 1, 1);
    expect(checkControllerPorts(imported, 1, signal(8))[0]).toMatchObject({ status: 'unknown', ok: false });
  });
});

describe('receiving-card hardware limits', () => {
  it('matches only source-backed card names and preserves unknown models', () => {
    expect(receiverLimit('novastar A10S-PRO')?.model).toBe('A10s Pro');
    expect(receiverLimit('A8s Pro')).toBeUndefined();
    expect(receiverLimit('A4s Plus')).toBeUndefined();
    expect(checkReceiverCard(preset('A8s Pro', 128, 128), signal(8))).toMatchObject({ status: 'unknown', ok: false });
  });

  it('checks A10s Pro 8/10-bit and 12-bit boundaries', () => {
    expect(checkReceiverCard(preset('A10s Pro', 512, 512), signal(8))).toMatchObject({ status: 'ok', ok: true, limitWidth: 512, limitHeight: 512 });
    expect(checkReceiverCard(preset('A10s Pro', 513, 512), signal(8))).toMatchObject({ status: 'overload', ok: false });
    expect(checkReceiverCard(preset('A10s Pro', 512, 256), signal(12))).toMatchObject({ status: 'ok', ok: true, limitHeight: 256 });
    expect(checkReceiverCard(preset('A10s Pro', 512, 257), signal(12))).toMatchObject({ status: 'overload', ok: false });
  });

  it('requires the driver variant where NovaStar has different limits', () => {
    expect(checkReceiverCard(preset('A8s', 512, 384), signal(8))).toMatchObject({ status: 'unknown', ok: false });
    expect(checkReceiverCard(preset('A8s PWM', 512, 384), signal(8))).toMatchObject({ status: 'ok', ok: true });
    expect(checkReceiverCard(preset('A8s common', 385, 384), signal(8))).toMatchObject({ status: 'overload', ok: false, limitWidth: 384 });
    expect(checkReceiverCard(preset('A5s Plus common', 193, 384), signal(12))).toMatchObject({ status: 'overload', ok: false, limitWidth: 192 });
  });

  it('checks fixed A4s boundary', () => {
    expect(checkReceiverCard(preset('A4s', 256, 256), signal(12))).toMatchObject({ status: 'ok', ok: true });
    expect(checkReceiverCard(preset('A4s', 257, 256), signal(12))).toMatchObject({ status: 'overload', ok: false });
  });
});
