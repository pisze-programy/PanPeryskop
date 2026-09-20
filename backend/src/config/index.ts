import { time } from './time';
import { seed } from './seed';
import { queue } from './queue';
import { vps } from './vps';
import { going } from './providers/going';
import { maratonypolskie } from './providers/maratonypolskie';
import { getyourguide } from './providers/getyourguide';
import { multikino } from './providers/multikino';
import { cinemacity } from './providers/cinemacity';
import { helios } from './providers/helios';
import { luma } from './providers/luma';
import { meetup } from './providers/meetup';
import { travel } from './travel';
import { analytics } from './analytics';

export const CONFIG = {
  time,
  seed,
  queue,
  vps,
  providers: {
    going,
    maratonypolskie,
    getyourguide,
    multikino,
    cinemacity,
    helios,
    luma,
    meetup,
  },
  travel,
  analytics,
} as const;

export type { TravelTag, TravelRunType, PlaceKind } from './travel';
