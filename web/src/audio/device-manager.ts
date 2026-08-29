/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

const STORAGE_KEY = 'mac-timegrapher.input-device-id';

export interface AudioInput {
  deviceId: string;
  label: string;
  groupId: string;
}

/**
 * Ask for microphone access, then release the stream. enumerateDevices()
 * returns blank labels until a grant exists, so this must run before the
 * device list can be shown with real names.
 */
export async function requestPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

export async function listAudioInputs(): Promise<AudioInput[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Unnamed input', groupId: d.groupId }));
}

export function saveSelection(deviceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, deviceId);
  } catch {
    // Private browsing or a full quota. A forgotten preference is not worth
    // failing the capture over.
  }
}

export function loadSelection(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Pick the device to use: the saved one, else the system default, else the first. */
export function resolveSelection(saved: string | null, available: AudioInput[]): AudioInput | null {
  if (available.length === 0) return null;
  const match = available.find((d) => d.deviceId === saved);
  if (match) return match;
  return available.find((d) => d.deviceId === 'default') ?? available[0];
}
