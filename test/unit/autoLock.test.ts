import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoLock } from "../../src/shared/autoLock";

describe("AutoLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks after the timeout with no activity", () => {
    const onLock = vi.fn();
    const lock = new AutoLock(1000, onLock);
    lock.touch();
    vi.advanceTimersByTime(999);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("restarts the countdown on each touch", () => {
    const onLock = vi.fn();
    const lock = new AutoLock(1000, onLock);
    lock.touch();
    vi.advanceTimersByTime(900);
    lock.touch();
    vi.advanceTimersByTime(900);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("does not fire after stop()", () => {
    const onLock = vi.fn();
    const lock = new AutoLock(1000, onLock);
    lock.touch();
    lock.stop();
    vi.advanceTimersByTime(5000);
    expect(onLock).not.toHaveBeenCalled();
  });
});
