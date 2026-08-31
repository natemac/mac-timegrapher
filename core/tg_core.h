/*
    tg
    Copyright (C) 2015 Marcello Mamino

    Modified 2026-08-29 by MAC Bespoke Watch Co.: extracted the signal-processing
    declarations from src/tg.h into this header, so the DSP core can be built
    without GTK, PortAudio or pthread. The structures and algorithm declarations
    below are unchanged from the original; the tg_* API at the end is new.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
*/

#ifndef TG_CORE_H
#define TG_CORE_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <stdbool.h>
#include <complex.h>
#include <fftw3.h>
#include <stdarg.h>
/* algo.c uses FLT_MIN. Upstream never includes <float.h> — it arrives
   transitively through <gtk/gtk.h>, so dropping GTK exposes the omission. */
#include <float.h>

/* Deliberately absent: <gtk/gtk.h> and <pthread.h>. src/tg.h includes both,
   which is how algo.c ended up appearing to depend on GTK despite never
   calling into it. */

#define FILTER_CUTOFF 3000
#define CAL_DATA_SIZE 900

#define NSTEPS 4
#define FIRST_STEP 1
#define FIRST_STEP_LIGHT 0

#define EVENTS_MAX 100

#define MIN_BPH 8100
#define TYP_BPH 12000
#define MAX_BPH 72000
#define DEFAULT_BPH 21600
#define MIN_LA 10  /* deg */
#define MAX_LA 90  /* deg */
#define DEFAULT_LA 52 /* deg */

#define PRESET_BPH { 12000, 14400, 17280, 18000, 19800, 21600, 25200, 28800, 36000, 43200, 72000, 0 };

#ifdef DEBUG
#define debug(...) print_debug(__VA_ARGS__)
void print_debug(const char *format, ...);
#else
#define debug(...) {}
#endif

#define UNUSED(X) (void)(X)

/* Defined in tg_measure.c. The original defines this in interface.c, which is
   GTK, so the core carries its own copy. */
extern int preset_bph[];

/* ---------------------------------------------------------------- algo.c */

struct processing_buffers {
	int sample_rate;
	int sample_count;
	float *samples, *samples_sc, *waveform, *waveform_sc, *tic_wf, *slice_wf, *tic_c;
	fftwf_complex *fft, *sc_fft, *tic_fft, *slice_fft;
	fftwf_plan plan_a, plan_b, plan_c, plan_d, plan_e, plan_f, plan_g;
	struct filter *hpf, *lpf;
	double period,sigma,be,waveform_max,phase,tic_pulse,toc_pulse,amp;
	double cal_phase;
	int waveform_max_i;
	int tic,toc;
	int ready;
	uint64_t timestamp, last_tic, last_toc, events_from;
	uint64_t *events;
	unsigned char *events_tictoc;
	float amp_history;
#ifdef DEBUG
	int debug_size;
	float *debug;
#endif
};

struct calibration_data {
	int wp;
	int size;
	int state;
	double calibration;
	uint64_t start_time;
	double *times;
	double *phases;
	uint64_t *events;
};

void setup_buffers(struct processing_buffers *b);
void pb_destroy(struct processing_buffers *b);
struct processing_buffers *pb_clone(struct processing_buffers *p);
void pb_destroy_clone(struct processing_buffers *p);
void process(struct processing_buffers *p, int bph, double la, int light);
void setup_cal_data(struct calibration_data *cd);
void cal_data_destroy(struct calibration_data *cd);
int test_cal(struct processing_buffers *p);
int process_cal(struct processing_buffers *p, struct calibration_data *cd);

/* ------------------------------------------------------- measurement API */

/*
   The embedding interface. Everything above is upstream's; everything below is
   new, and is what the WebAssembly build and the command-line tool both use.

   The caller owns a tg_handle and pushes samples into it. The handle keeps no
   thread of its own: in the browser the AudioWorklet already provides the
   concurrency boundary, and on the command line there is nothing to be
   concurrent with.
*/

typedef struct tg_state *tg_handle;

typedef struct {
	int    sample_rate;   /* samples per second of the audio being pushed */
	int    bph;           /* 0 to detect automatically */
	double lift_angle;    /* degrees; needed for amplitude */
} tg_config;

typedef struct {
	double rate;           /* seconds per day, positive is fast */
	double amplitude;      /* degrees; 0 when not determinable */
	double beat_error;     /* milliseconds */
	int    detected_bph;
	double signal_quality; /* 0..1 */
	int    valid;          /* 0 when there is not yet a usable measurement */
} tg_result;

/* Returns NULL if the configuration is unusable or allocation fails. */
tg_handle tg_init(tg_config config);

/* Appends mono float samples in [-1, 1]. Safe to call with any count. */
void tg_push_samples(tg_handle h, const float *samples, int count);

/* Runs the analysis over the samples pushed so far. */
tg_result tg_get_result(tg_handle h);

/*
   Beat positions found by the most recent tg_get_result, as seconds since
   capture started, with 1 for a tick and 0 for a tock. Returns how many were
   written. This is what a paper-strip trace plots: each beat is a mark, and
   the slope of the resulting line is the rate.
*/
int tg_get_events(tg_handle h, double *out_time, unsigned char *out_tictoc, int max);

/*
   The averaged beat waveform, windowed around the tick and around the tock.

   This is the picture a watchmaker reads directly: the locking, the impulse
   and the drop show up as distinct features, and a chipped pallet stone or a
   poor lock is visible in the shape long before any single number moves. The
   window and the 0.4 headroom factor are output_panel.c's, so the browser and
   the GTK panel draw the same curve.

   Amplitude is not returned here on purpose. It is read off the horizontal
   position of the impulse: asin(lift_angle / 2A) / pi periods before the beat.
   The caller has the lift angle and the period, so it can draw that scale
   itself, and drawing it is the point of the display.
*/
#define TG_WAVEFORM_MS_BEFORE 25   /* NEGATIVE_SPAN in src/output_panel.c */
#define TG_WAVEFORM_MS_AFTER  10   /* POSITIVE_SPAN */
#define TG_WAVEFORM_POINTS    700  /* twenty per millisecond */

typedef struct {
	int    points;         /* points written to each of the two buffers */
	double ms_before;      /* window start, milliseconds before the beat */
	double ms_after;
	double period_seconds; /* one beat; the amplitude scale needs it */
	double tic_pulse_ms;   /* impulse, milliseconds BEFORE the beat; -1 if unknown */
	double toc_pulse_ms;
	int    valid;          /* 0 when there is no analysed window yet */
} tg_waveform;

/*
   Writes TG_WAVEFORM_POINTS floats into each of out_tic and out_toc and fills
   info. Returns the number of points written, or 0 if there is nothing to
   draw yet. Both buffers must hold at least TG_WAVEFORM_POINTS floats.
*/
int tg_get_waveform(tg_handle h, float *out_tic, float *out_toc, tg_waveform *info);

/*
   ------------------------------------------------------------ calibration

   Measuring the sound card's own clock against a quartz watch, which is what
   upstream's Calibrate menu item does. The algorithm is already in tg_algo.c
   (test_cal, process_cal, compute_cal) and unchanged; this only drives it.

   A quartz movement with a ticking seconds hand gives one impulse per second.
   Its phase is tracked against the audio clock and a line fitted through the
   drift, so the slope is the sound card's error in seconds per day. The fit is
   only accepted when its own uncertainty is under 0.1 s/day, which takes
   CAL_DATA_SIZE samples at roughly one a second — about fifteen minutes.

   It runs on the same handle and the same audio, because a bench never
   calibrates and measures at once. While calibration is running tg_get_result
   is not meaningful: begin, feed audio, read, end.

   What this cannot do is tell the sound card apart from the watch. The result
   is the difference between the two, and all of it is attributed to the card.
   A reference watch specified to +/-20 s/month carries +/-0.66 s/day of its
   own into every figure this produces.
*/
typedef struct {
	int    collected;   /* phase samples taken so far */
	int    needed;      /* how many it wants; CAL_DATA_SIZE */
	int    signal;      /* 0..NSTEPS — how well the once-a-second tick is locked */
	int    state;       /* 0 still running, 1 accepted, -1 finished but too noisy */
	double drift_seconds_per_day;  /* meaningful only when state is 1 */
} tg_cal;

/* Starts a calibration run, discarding any previous one. 0 if allocation fails. */
int tg_cal_begin(tg_handle h);

/* Runs one calibration cycle over the audio pushed so far. Call about once a
   second; it takes at most one phase sample per call by design. */
tg_cal tg_cal_update(tg_handle h);

/* Ends the run and frees its data. Safe to call when none is running. */
void tg_cal_end(tg_handle h);

/* Discards accumulated audio, keeping the configuration. */
void tg_reset(tg_handle h);

/* Frees everything, including the seven FFTW plans a handle owns. */
void tg_destroy(tg_handle h);

/* Version of the core, for the harness to print. */
const char *tg_version(void);

#endif /* TG_CORE_H */
