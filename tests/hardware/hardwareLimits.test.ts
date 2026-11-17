import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
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
    assert.equal(controllerLimit(' MCTRL-660 PRO ' )?.model, 'MCTRL660 PRO');
    assert.equal(controllerLimit('MCTRL 660')?.model, 'MCTRL660');
    assert.notEqual(controllerLimit('MCTRL 660 PRO')?.model, 'MCTRL660');
  });

  it('checks known canvas boundaries inclusively', () => {
    const known = processor('MCTRL4K', 1, 0);
    known.ports[0].assignedCabinets = ['one'];
    const knownCheck = checkControllerCanvas(known, 8_800_000)[0];
    assert.deepEqual({ status: knownCheck.status, ok: knownCheck.ok, limit: knownCheck.limit }, { status: 'ok', ok: true, limit: 8_800_000 });

    const over = processor('MCTRL4K', 1, 0);
    over.ports[0].assignedCabinets = ['one', 'two'];
    const overCheck = checkControllerCanvas(over, 4_400_001)[0];
    assert.deepEqual({ status: overCheck.status, ok: overCheck.ok }, { status: 'overload', ok: false });

    const depthSpecific = processor('MCTRL660', 1, 0);
    depthSpecific.ports[0].assignedCabinets = ['one'];
    const depthCheck = checkControllerCanvas(depthSpecific, 2_304_000, signal(8))[0];
    assert.deepEqual({ status: depthCheck.status, limit: depthCheck.limit }, { status: 'ok', limit: 2_304_000 });
    const unknownDepthCheck = checkControllerCanvas(depthSpecific, 1, signal(10))[0];
    assert.deepEqual({ status: unknownDepthCheck.status, ok: unknownDepthCheck.ok }, { status: 'unknown', ok: false });
  });

  it('checks a known canvas per sending card instead of combining independent units', () => {
    const twoControllers = processor('MCTRL660', 2, 0);
    twoControllers.ports[0].assignedCabinets = ['cabinet-1'];
    twoControllers.ports[16].assignedCabinets = ['cabinet-2'];
    const checks = checkControllerCanvas(twoControllers, 2_304_000, signal(8));
    assert.equal(checks.length, 2);
    assert.equal(checks.every((check) => check.status === 'ok'), true);
  });

  it('does not invent an aggregate canvas for modular H-series', () => {
    const result = checkControllerCanvas(processor('H9', 5), 1_000_000)[0];
    assert.deepEqual({ status: result.status, ok: result.ok }, { status: 'unknown', ok: false });
    assert.equal(result.limit, undefined);
    assert.ok(result.reason?.includes('chassis variant'));
  });

  it('keeps H15 standard/enhanced card boundaries explicit', () => {
    const h15Standard = checkSendingCardCount(processor('H15', 10))[0];
    assert.deepEqual({ status: h15Standard.status, ok: h15Standard.ok, limit: h15Standard.limit }, { status: 'ok', ok: true, limit: 10 });
    const h15Enhanced = checkSendingCardCount(processor('H15', 11))[0];
    assert.deepEqual({ status: h15Enhanced.status, ok: h15Enhanced.ok, limit: h15Enhanced.limit }, { status: 'unknown', ok: false, limit: 16 });
    const h15Over = checkSendingCardCount(processor('H15', 17))[0];
    assert.deepEqual({ status: h15Over.status, ok: h15Over.ok, limit: h15Over.limit }, { status: 'overload', ok: false, limit: 16 });
    const h9Over = checkSendingCardCount(processor('H9', 6))[0];
    assert.deepEqual({ status: h9Over.status, ok: h9Over.ok, limit: h9Over.limit }, { status: 'overload', ok: false, limit: 5 });
  });

  it('reports depth-specific port capacity and unknown depth honestly', () => {
    const h9 = processor('H9', 1, 1);
    const h9Eight = checkControllerPorts(h9, 650_000, signal(8))[0];
    assert.deepEqual({ status: h9Eight.status, limit: h9Eight.limit }, { status: 'ok', limit: 650_000 });
    const h9Ten = checkControllerPorts(h9, 320_001, signal(10))[0];
    assert.deepEqual({ status: h9Ten.status, limit: h9Ten.limit }, { status: 'overload', limit: 320_000 });
    const h9Twelve = checkControllerPorts(h9, 1, signal(12))[0];
    assert.deepEqual({ status: h9Twelve.status, ok: h9Twelve.ok }, { status: 'unknown', ok: false });

    const imported = processor('Sending card 1', 1, 1);
    const importedCheck = checkControllerPorts(imported, 1, signal(8))[0];
    assert.deepEqual({ status: importedCheck.status, ok: importedCheck.ok }, { status: 'unknown', ok: false });
  });
});

describe('receiving-card hardware limits', () => {
  it('matches only source-backed card names and preserves unknown models', () => {
    assert.equal(receiverLimit('novastar A10S-PRO')?.model, 'A10s Pro');
    assert.equal(receiverLimit('A8s Pro'), undefined);
    assert.equal(receiverLimit('A4s Plus'), undefined);
    const unknownReceiver = checkReceiverCard(preset('A8s Pro', 128, 128), signal(8));
    assert.deepEqual({ status: unknownReceiver.status, ok: unknownReceiver.ok }, { status: 'unknown', ok: false });
  });

  it('checks A10s Pro 8/10-bit and 12-bit boundaries', () => {
    const eightBit = checkReceiverCard(preset('A10s Pro', 512, 512), signal(8));
    assert.deepEqual({ status: eightBit.status, ok: eightBit.ok, limitWidth: eightBit.limitWidth, limitHeight: eightBit.limitHeight }, { status: 'ok', ok: true, limitWidth: 512, limitHeight: 512 });
    assert.equal(eightBit.source, 'https://oss.novastar.tech/uploads/2024/12/A10s-Pro-Receiving-Card-Specifications-V1.3.0.pdf');
    assert.ok(eightBit.applicability?.includes('8/10-bit'));

    const tenBit = checkReceiverCard(preset('A10s Pro', 512, 512), signal(10));
    assert.deepEqual({ status: tenBit.status, ok: tenBit.ok, limitWidth: tenBit.limitWidth, limitHeight: tenBit.limitHeight }, { status: 'ok', ok: true, limitWidth: 512, limitHeight: 512 });
    const eightOver = checkReceiverCard(preset('A10s Pro', 513, 512), signal(8));
    assert.deepEqual({ status: eightOver.status, ok: eightOver.ok }, { status: 'overload', ok: false });

    // NovaStar's A10s Pro specification explicitly assigns 512×256@60Hz to
    // 12-bit sources; keep this regression separate from the 8/10-bit case.
    const twelveBit = checkReceiverCard(preset('A10s Pro', 512, 256), signal(12));
    assert.deepEqual({ status: twelveBit.status, ok: twelveBit.ok, limitWidth: twelveBit.limitWidth, limitHeight: twelveBit.limitHeight }, { status: 'ok', ok: true, limitWidth: 512, limitHeight: 256 });
    assert.equal(twelveBit.source, eightBit.source);
    assert.ok(twelveBit.applicability?.includes('12-bit'));
    const twelveOver = checkReceiverCard(preset('A10s Pro', 512, 257), signal(12));
    assert.deepEqual({ status: twelveOver.status, ok: twelveOver.ok }, { status: 'overload', ok: false });
  });

  it('requires the driver variant where NovaStar has different limits', () => {
    const missingDriver = checkReceiverCard(preset('A8s', 512, 384), signal(8));
    assert.deepEqual({ status: missingDriver.status, ok: missingDriver.ok }, { status: 'unknown', ok: false });
    assert.ok(missingDriver.reason?.includes('driver IC variant'));
    assert.equal(missingDriver.source, 'https://oss.novastar.tech/uploads/2023/01/A8s-Receiving-Card-Specifications-V2.2.3.pdf');
    assert.ok(missingDriver.applicability?.includes('driver IC type is required'));
    const pwm = checkReceiverCard(preset('A8s PWM', 512, 384), signal(8));
    assert.deepEqual({ status: pwm.status, ok: pwm.ok }, { status: 'ok', ok: true });
    const commonOver = checkReceiverCard(preset('A8s common', 385, 384), signal(8));
    assert.deepEqual({ status: commonOver.status, ok: commonOver.ok, limitWidth: commonOver.limitWidth }, { status: 'overload', ok: false, limitWidth: 384 });
    const a5sOver = checkReceiverCard(preset('A5s Plus common', 193, 384), signal(12));
    assert.deepEqual({ status: a5sOver.status, ok: a5sOver.ok, limitWidth: a5sOver.limitWidth }, { status: 'overload', ok: false, limitWidth: 192 });
  });

  it('checks fixed A4s boundary', () => {
    const a4s = checkReceiverCard(preset('A4s', 256, 256), signal(12));
    assert.deepEqual({ status: a4s.status, ok: a4s.ok }, { status: 'ok', ok: true });
    const a4sOver = checkReceiverCard(preset('A4s', 257, 256), signal(12));
    assert.deepEqual({ status: a4sOver.status, ok: a4sOver.ok }, { status: 'overload', ok: false });
  });
});
