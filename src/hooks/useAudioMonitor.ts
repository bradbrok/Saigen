import { useEffect, useRef } from 'react'
import type { SimulationControls } from '../circuit/types'
import { midiNoteToFrequency } from '../simulation/voice'

interface AudioGraph {
  context: AudioContext
  oscillator: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
}

export function useAudioMonitor(controls: SimulationControls): void {
  const graphRef = useRef<AudioGraph | null>(null)

  useEffect(() => {
    if (!controls.monitor) return

    const context = new AudioContext({ latencyHint: 'interactive' })
    const oscillator = context.createOscillator()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    oscillator.type = 'sawtooth'
    oscillator.frequency.value = midiNoteToFrequency(controls.note)
    filter.type = 'lowpass'
    filter.frequency.value = controls.cutoff
    filter.Q.value = 0.7 + controls.resonance * 18
    gain.gain.value = controls.running ? controls.envelope * 0.045 : 0
    oscillator.connect(filter).connect(gain).connect(context.destination)
    oscillator.start()
    void context.resume()
    graphRef.current = { context, oscillator, filter, gain }

    return () => {
      graphRef.current = null
      try {
        oscillator.stop()
      } catch {
        // The oscillator may already be stopped during fast refresh.
      }
      void context.close()
    }
  }, [controls.monitor])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    const now = graph.context.currentTime
    graph.oscillator.frequency.setTargetAtTime(midiNoteToFrequency(controls.note), now, 0.01)
    graph.filter.frequency.setTargetAtTime(Math.min(20_000, controls.cutoff), now, 0.012)
    graph.filter.Q.setTargetAtTime(0.7 + controls.resonance * 18, now, 0.012)
    graph.gain.gain.setTargetAtTime(controls.running ? controls.envelope * 0.045 : 0, now, 0.015)
  }, [controls.note, controls.cutoff, controls.resonance, controls.envelope, controls.running])
}
