/*
    tg
    Copyright (C) 2015 Marcello Mamino

    Modified 2026-08-29 by MAC Bespoke Watch Co.: this file carries the
    measurement logic that upstream keeps in src/computer.c — guess_bph() and
    the conversions in compute_results() — with the pthread scaffolding and the
    calibration state machine left behind. The arithmetic is unchanged. The
    surrounding tg_* embedding API is new.

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

#include "tg_core.h"

/* Upstream defines this in interface.c, which is GTK. */
int preset_bph[] = PRESET_BPH;

struct tg_state {
	tg_config config;

	struct processing_buffers *steps;  /* NSTEPS windows, 2s to 16s */
	int initialized_steps;

	float   *ring;      /* most recent audio, sized to the longest window */
	int      ring_size;
	int      write_pos;
	uint64_t total_pushed;
};

/*
   Unchanged from computer.c. Picks the nearest standard beat rate to the
   measured one, which is why a movement running badly still reports 21600
   rather than some arbitrary number.
*/
static int guess_bph(double period)
{
	double bph = 7200 / period;
	double min = bph;
	int i, ret;

	ret = 0;
	for(i = 0; preset_bph[i]; i++) {
		double diff = fabs(bph - preset_bph[i]);
		if(diff < min) {
			min = diff;
			ret = i;
		}
	}

	return preset_bph[ret];
}

const char *tg_version(void)
{
	return "tg-core 0.1 (derived from tg 0.8.0)";
}

tg_handle tg_init(tg_config config)
{
	if(config.sample_rate <= 0) return NULL;
	if(config.lift_angle < MIN_LA || config.lift_angle > MAX_LA) return NULL;
	if(config.bph != 0 && (config.bph < MIN_BPH || config.bph > MAX_BPH)) return NULL;

	struct tg_state *s = calloc(1, sizeof(*s));
	if(!s) return NULL;
	s->config = config;

	s->steps = calloc(NSTEPS, sizeof(struct processing_buffers));
	if(!s->steps) { free(s); return NULL; }

	/* Windows of 2, 4, 8 and 16 seconds. process() is run shortest first and
	   the longest window that converged wins, so a short recording still
	   produces a reading — just a less certain one. */
	for(int i = 0; i < NSTEPS; i++) {
		s->steps[i].sample_rate  = config.sample_rate;
		s->steps[i].sample_count = config.sample_rate * (1 << (i + FIRST_STEP));
		setup_buffers(&s->steps[i]);
		s->initialized_steps++;
	}

	s->ring_size = s->steps[NSTEPS - 1].sample_count;
	s->ring = calloc(s->ring_size, sizeof(float));
	if(!s->ring) { tg_destroy(s); return NULL; }

	return s;
}

void tg_push_samples(tg_handle h, const float *samples, int count)
{
	if(!h || !samples || count <= 0) return;

	/* A push longer than the ring can only leave its tail behind. */
	if(count > h->ring_size) {
		samples += count - h->ring_size;
		count = h->ring_size;
	}

	int first = h->ring_size - h->write_pos;
	if(first > count) first = count;
	memcpy(h->ring + h->write_pos, samples, first * sizeof(float));
	if(count > first)
		memcpy(h->ring, samples + first, (count - first) * sizeof(float));

	h->write_pos = (h->write_pos + count) % h->ring_size;
	h->total_pushed += count;
}

/* C's % keeps the sign of the dividend, so a negative index needs correcting
   before it can address the ring. */
static int wrap(int i, int n)
{
	int m = i % n;
	return m < 0 ? m + n : m;
}

/* Copy the most recent sample_count samples out of the ring, oldest first. */
static void fill_step(struct tg_state *s, struct processing_buffers *p)
{
	int start = wrap(s->write_pos - p->sample_count, s->ring_size);
	int first = s->ring_size - start;
	if(first > p->sample_count) first = p->sample_count;
	memcpy(p->samples, s->ring + start, first * sizeof(float));
	if(p->sample_count > first)
		memcpy(p->samples + first, s->ring, (p->sample_count - first) * sizeof(float));
	p->timestamp = s->total_pushed;
}

tg_result tg_get_result(tg_handle h)
{
	tg_result r = { 0, 0, 0, 0, 0.0, 0 };
	if(!h) return r;

	/* Nothing useful before the shortest window is full. */
	if(h->total_pushed < (uint64_t)h->steps[0].sample_count) {
		r.detected_bph = h->config.bph ? h->config.bph : DEFAULT_BPH;
		return r;
	}

	int ready = 0;
	for(int i = 0; i < NSTEPS; i++) {
		if((uint64_t)h->steps[i].sample_count > h->total_pushed) break;
		fill_step(h, &h->steps[i]);
		h->steps[i].last_tic = 0;
		h->steps[i].events_from = 0;
		process(&h->steps[i], h->config.bph, h->config.lift_angle, 0);
		if(!h->steps[i].ready) break;
		ready++;
	}

	/* Walk back from the longest converged window to one whose spread is
	   tight enough to trust. Unchanged from compute_update(). */
	int i = ready - 1;
	for(; i >= 0 && h->steps[i].sigma > h->steps[i].period / 10000; i--);

	if(i < 0) {
		r.detected_bph = h->config.bph ? h->config.bph : DEFAULT_BPH;
		return r;
	}

	struct processing_buffers *p = &h->steps[i];
	double sample_rate = h->config.sample_rate;

	/* The conversions below are compute_results() verbatim, minus the
	   calibration term, which this milestone does not carry. */
	r.detected_bph = h->config.bph ? h->config.bph : guess_bph(p->period / sample_rate);
	r.rate = (7200 / (r.detected_bph * p->period / sample_rate) - 1) * 24 * 3600;
	r.beat_error = fabs(p->be) * 1000 / sample_rate;
	r.amplitude = h->config.lift_angle * p->amp;
	if(r.amplitude < 135 || r.amplitude > 360)
		r.amplitude = 0; /* upstream treats out-of-range as "not available" */

	/* How many windows converged, as a fraction of all of them. */
	r.signal_quality = (double)ready / NSTEPS;
	r.valid = 1;

	return r;
}

void tg_reset(tg_handle h)
{
	if(!h) return;
	memset(h->ring, 0, h->ring_size * sizeof(float));
	h->write_pos = 0;
	h->total_pushed = 0;
}

void tg_destroy(tg_handle h)
{
	if(!h) return;
	for(int i = 0; i < h->initialized_steps; i++)
		pb_destroy(&h->steps[i]);
	free(h->steps);
	free(h->ring);
	free(h);
}
