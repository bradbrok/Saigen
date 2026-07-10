# Saigen

**Brok Modular Saigen** is an instrument-first circuit studio for modern synthesizer design. The goal is to keep the immediacy of Falstad—edit while the circuit is running, see signals move, probe anything—then carry the same design into an engineering workflow built around SPICE and KiCad.

This repository currently contains the first browser MVP: an interactive SSI subtractive voice and the architectural seams needed for a real solver and loss-aware KiCad interchange.

## What works now

- Desktop schematic studio with a searchable synth-oriented component library.
- Unbounded pan-and-zoom schematic workspace with blank/middle-button drag, wheel/trackpad pan, cursor-centered pinch or Ctrl/⌘-wheel zoom, and Fit Circuit.
- Select, place, move beyond the original sheet bounds, duplicate, delete, undo, redo, click-to-click wiring, and drag directly from any pin to a compatible endpoint.
- Expanded sources and primitives: constant CV, live gate, repeating trigger, multi-wave function generator, LFO, noise, clock, inductor, diode, LED, Zener, switch, BJTs, MOSFETs, comparator, mixer, attenuverter, and Eurorack rails.
- Signal-aware audio, CV, gate, power, and passive nets.
- A flagship `SSI2131 → SSI2144 → SSI2164` voice.
- Live cutoff, resonance, drive, pitch, envelope, source, utility, waveform, and AC-response controls.
- Click-to-probe nets with four persistent color-coded scope channels, channel visibility and volts/div, 50 µs–10 s/div adaptive timebase, trigger controls, and Vpp/RMS/frequency measurements.
- SSI chip ground pins default to the `GND` net, are marked `AUTO GND`, and are overridden by any explicit connection.
- Inline design checks for missing grounds, incomplete power connections, broken nets, and unsupported models.
- Optional browser audio monitor using Web Audio.
- Pure TypeScript electrical-core validation for engineering values, linear systems, voltage dividers, and RC transient response.
- Portable versioned Saigen JSON projects.
- Portable KiCad project ZIP export with a modern `.kicad_sch`, project-local symbol/footprint tables, full SSI pinouts, multi-unit symbols, datasheet URLs, package fields, and PSL16/PSSL16 footprints.
- `.kicad_sch` import for symbols plus exact Saigen graph round trips; unsupported symbols are surfaced as visual blocks with warnings.

## Start the app

```bash
pnpm install --store-dir .pnpm-store
pnpm dev
```

Then open `http://127.0.0.1:4173`.

Validation:

```bash
pnpm test
pnpm build
```

## Model fidelity

The named SSI blocks in this MVP are **datasheet-informed behavioral previews**, not transistor-level models and not sign-off simulation. The canvas deliberately exposes compact musical signal-flow ports. KiCad export expands those macros into the complete 16-pin packages: three locked units for SSI2131, three for SSI2144, and four VCA cells plus a visible power/mode unit for SSI2164. The export does not silently invent the required external application circuitry; the generated design notes call out those remaining production checks.

The small electrical core is real and tested, but it is deliberately not growing into a home-built general SPICE implementation. The production solver boundary is intended for ngspice in a Dedicated Worker, compiled to WebAssembly, with native ngspice used as the validation oracle. A reduced DSP/behavioral path can remain for responsive audio preview.

## Architecture

```text
CircuitDocument (neutral graph)
├── editor        SVG symbols, pins, tools, selection, wiring
├── simulation    tested primitives + musical preview; ngspice adapter next
├── components    visuals, ports, parameters, model fidelity, KiCad mapping
├── kicad         generic S-expression parser + versioned import/export adapter
└── persistence   versioned JSON and browser file interchange
```

The canonical document is intentionally not a KiCad AST or a SPICE netlist. Visual geometry, electrical connectivity, simulation behavior, package pins, and fabrication metadata need to evolve independently. Importers should preserve or explicitly report unsupported material rather than silently dropping it.

## Current KiCad boundary

Saigen-authored files round-trip the component graph and connections through hidden `Saigen.*` symbol properties. Import remains compatible with early `EuroSim.*` metadata and collapses a KiCad multi-unit device back into one compact Saigen component. Exported schematics embed their symbols and the ZIP also includes a project-local `Saigen.kicad_sym`, `Saigen.pretty`, `sym-lib-table`, and `fp-lib-table`. SSI package pins are identity-mapped to pads 1–16, with no invented NC or exposed pads.

The current beta does **not** yet provide:

- Generic wire-to-pin connectivity inference for arbitrary imported KiCad files.
- Round-tripping wire geometry edits made in KiCad when Saigen graph metadata is present.
- Hierarchical sheets, buses, or lossless pass-through of every unknown S-expression.
- A multi-version KiCad CLI validation matrix in CI. The generated reference bundle is currently smoke-tested locally with KiCad CLI 9.0.3.
- Automatic conversion of browser behavioral models into KiCad/ngspice subcircuits.
- Automatic generation of each SSI datasheet application network (timing/pole capacitors, I/V stages, CV scaling, references, and decoupling) from a compact canvas macro.

## Recommended milestones

1. **Canonical net compiler** — resolve pins, wires, junctions, and labels into persistent nets so disconnecting a wire changes the simulated result.
2. **Electrical vertical slice** — ngspice/WASM worker spike covering DC, AC, transient, `.model`, `.subckt`, behavioral sources, cancellation, memory reuse, and Safari/Firefox/Chrome.
3. **Buildable SSI voice** — reusable external application-circuit templates, supply diagnostics, and models validated against published curves around the now-complete SSI package symbols.
4. **KiCad beta** — flat KiCad 9/10 import/export, embedded symbols, labels, junctions, footprints, simulation properties, golden fixtures, and `kicad-cli` ERC/netlist tests.
5. **Instrument workflow** — timestamped scope ring buffers, FFT, cursors, AudioWorklet playback, MIDI, automation, WAV export, tolerances, and curated datasheet labs.

## Primary references

- [Falstad Circuit Simulator](https://www.falstad.com/circuit/)
- [KiCad schematic file format](https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/)
- [KiCad simulator and ngspice integration](https://docs.kicad.org/9.0/en/eeschema/eeschema.html#simulator)
- [ngspice shared-library interface](https://ngspice.sourceforge.io/shared.html)
- [SSI2131 datasheet](https://www.soundsemiconductor.com/downloads/ssi2131datasheet.pdf)
- [SSI2144 datasheet](https://www.soundsemiconductor.com/downloads/ssi2144datasheet.pdf)
- [SSI2164 datasheet](https://www.soundsemiconductor.com/downloads/ssi2164datasheet.pdf)

CircuitJS is a valuable UX and solver reference, but this project does not reuse its code. CircuitJS is GPL-2.0 and its legacy Java/GWT architecture is not the chosen foundation for Saigen.
