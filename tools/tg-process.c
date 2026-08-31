/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    Command-line harness: reads a WAV, runs the extracted DSP core over it, and
    prints the measurements. This is what the WebAssembly build is checked
    against, and what a fixture's expected values are produced from.

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

#include "../core/tg_core.h"
#include "../core/tg_wav.h"

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static void usage(const char *argv0)
{
	fprintf(stderr,
		"usage: %s [options] FILE.wav\n"
		"\n"
		"  --bph N     beat rate; omit or 0 to detect automatically\n"
		"  --lift N    lift angle in degrees (default %d)\n"
		"  --json      emit JSON instead of a human-readable report\n"
		"  --waveform  add the averaged tick and tock windows to the JSON\n"
		"  --calibrate treat the file as a quartz reference and measure the\n"
		"              sound card's clock error instead of timing a watch\n"
		"  --version   print the core version and exit\n"
		"\n"
		"Reads 32-bit float or 16-bit PCM WAV. Multi-channel input is\n"
		"downmixed to mono.\n",
		argv0, DEFAULT_LA);
}

/*
   The averaged beat, as the browser receives it. Printed so the display can be
   checked against a recording without a bench: the impulse marker's position
   is where amplitude comes from, and a sign error there would move it without
   changing any number the report already prints.
*/
static void print_waveform(tg_handle h)
{
	static float tic[TG_WAVEFORM_POINTS], toc[TG_WAVEFORM_POINTS];
	tg_waveform info;

	if(!tg_get_waveform(h, tic, toc, &info)) {
		printf(",\n  \"waveform\": null");
		return;
	}

	printf(",\n  \"waveform\": {\n");
	printf("    \"points\": %d,\n", info.points);
	printf("    \"msBefore\": %g,\n", info.ms_before);
	printf("    \"msAfter\": %g,\n", info.ms_after);
	printf("    \"periodSeconds\": %.6f,\n", info.period_seconds);
	printf("    \"ticPulseMs\": %.4f,\n", info.tic_pulse_ms);
	printf("    \"tocPulseMs\": %.4f,\n", info.toc_pulse_ms);
	for(int pass = 0; pass < 2; pass++) {
		const float *v = pass ? toc : tic;
		printf("    \"%s\": [", pass ? "toc" : "tic");
		for(int i = 0; i < info.points; i++)
			printf("%s%.5f", i ? "," : "", v[i]);
		printf("]%s\n", pass ? "" : ",");
	}
	printf("  }");
}

/*
   Feeds the file a second at a time, because the calibration takes at most one
   phase sample per call by design — hand it everything at once and it records
   a single point. Live, the browser calls it at about this rate for the same
   reason.
*/
static int run_calibration(tg_handle h, struct tg_wav *wav, int json)
{
	if(!tg_cal_begin(h)) {
		fprintf(stderr, "error: could not start calibration\n");
		return 1;
	}

	int block = wav->sample_rate;
	tg_cal c = { 0, 0, 0, 0, 0 };

	for(uint64_t at = 0; at < wav->frame_count; at += block) {
		int n = (int)(wav->frame_count - at);
		if(n > block) n = block;
		tg_push_samples(h, wav->samples + at, n);
		c = tg_cal_update(h);
	}

	if(json) {
		printf("{\n");
		printf("  \"collected\": %d,\n", c.collected);
		printf("  \"needed\": %d,\n", c.needed);
		printf("  \"signal\": %d,\n", c.signal);
		printf("  \"state\": %d,\n", c.state);
		printf("  \"driftSecondsPerDay\": %.4f\n", c.drift_seconds_per_day);
		printf("}\n");
	} else {
		printf("  SIGNAL      %d of %d\n", c.signal, NSTEPS);
		printf("  SAMPLES     %d of %d\n", c.collected, c.needed);
		if(c.state == 1)
			printf("  CLOCK       %+.2f s/day\n", c.drift_seconds_per_day);
		else if(c.state == -1)
			printf("  CLOCK       inconclusive - the fit was too noisy to accept\n");
		else
			printf("  CLOCK       still collecting\n");
	}

	tg_cal_end(h);
	return c.state == 1 ? 0 : 3;
}

int main(int argc, char **argv)
{
	int bph = 0;
	double lift = DEFAULT_LA;
	int json = 0;
	int waveform = 0;
	int calibrate = 0;
	const char *path = NULL;

	for(int i = 1; i < argc; i++) {
		if(!strcmp(argv[i], "--version")) {
			printf("%s\n", tg_version());
			return 0;
		} else if(!strcmp(argv[i], "--calibrate")) {
			calibrate = 1;
		} else if(!strcmp(argv[i], "--waveform")) {
			waveform = 1;
			json = 1;
		} else if(!strcmp(argv[i], "--json")) {
			json = 1;
		} else if(!strcmp(argv[i], "--bph") && i + 1 < argc) {
			bph = atoi(argv[++i]);
		} else if(!strcmp(argv[i], "--lift") && i + 1 < argc) {
			lift = atof(argv[++i]);
		} else if(argv[i][0] == '-') {
			usage(argv[0]);
			return 2;
		} else {
			path = argv[i];
		}
	}

	if(!path) { usage(argv[0]); return 2; }

	struct tg_wav wav;
	char err[512];
	if(!tg_wav_read(path, &wav, err, sizeof err)) {
		fprintf(stderr, "error: %s\n", err);
		return 1;
	}

	tg_config config = { wav.sample_rate, bph, lift };
	tg_handle h = tg_init(config);
	if(!h) {
		fprintf(stderr, "error: could not initialise core "
		        "(sample rate %d, bph %d, lift angle %g)\n",
		        wav.sample_rate, bph, lift);
		tg_wav_free(&wav);
		return 1;
	}

	if(calibrate) {
		int rc = run_calibration(h, &wav, json);
		tg_destroy(h);
		tg_wav_free(&wav);
		return rc;
	}

	tg_push_samples(h, wav.samples, (int)wav.frame_count);
	tg_result r = tg_get_result(h);

	double seconds = (double)wav.frame_count / wav.sample_rate;

	if(json) {
		printf("{\n");
		printf("  \"file\": \"%s\",\n", path);
		printf("  \"sampleRate\": %d,\n", wav.sample_rate);
		printf("  \"durationSeconds\": %.3f,\n", seconds);
		printf("  \"valid\": %s,\n", r.valid ? "true" : "false");
		printf("  \"detectedBph\": %d,\n", r.detected_bph);
		printf("  \"rate\": %.2f,\n", r.rate);
		printf("  \"amplitude\": %.1f,\n", r.amplitude);
		printf("  \"beatError\": %.3f,\n", r.beat_error);
		printf("  \"signalQuality\": %.2f", r.signal_quality);
		if(waveform) print_waveform(h);
		printf("\n}\n");
	} else {
		printf("%s\n", path);
		printf("  %d Hz, %.1f s, %d ch %s\n", wav.sample_rate, seconds,
		       wav.channel_count, wav.source_float ? "float32" : "pcm16");
		printf("\n");
		if(!r.valid) {
			printf("  no reliable measurement\n");
			if(seconds < 2)
				printf("  (recording is shorter than the 2 s minimum window)\n");
			else
				printf("  (no analysis window converged - check the signal has\n"
				       "   evenly spaced impulse pairs rather than continuous noise)\n");
		} else {
			printf("  BPH         %d%s\n", r.detected_bph, bph ? " (given)" : " (detected)");
			printf("  RATE        %+.1f s/day\n", r.rate);
			if(r.amplitude > 0)
				printf("  AMPLITUDE   %.0f deg (lift angle %g)\n", r.amplitude, lift);
			else
				printf("  AMPLITUDE   not available\n");
			printf("  BEAT ERROR  %.2f ms\n", r.beat_error);
			printf("  SIGNAL      %.0f%%\n", r.signal_quality * 100);
		}
	}

	tg_destroy(h);
	tg_wav_free(&wav);
	return r.valid ? 0 : 3;
}
