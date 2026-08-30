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

/* Discards accumulated audio, keeping the configuration. */
void tg_reset(tg_handle h);

/* Frees everything, including the seven FFTW plans a handle owns. */
void tg_destroy(tg_handle h);

/* Version of the core, for the harness to print. */
const char *tg_version(void);

#endif /* TG_CORE_H */
