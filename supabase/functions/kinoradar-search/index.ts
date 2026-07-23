import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type MediaType = "movie" | "tv";

const allowedOrigins = new Set([
  "https://nesterov2u.github.io",
  "http://localhost:8000",
  "null",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://nesterov2u.github.io",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yearFromDate(value: unknown) {
  return typeof value === "string" && /^\d{4}/.test(value)
    ? Number(value.slice(0, 4))
    : null;
}

function imageUrl(path: unknown, size = "w342") {
  return typeof path === "string" && path
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : null;
}

function castFrom(payload: Record<string, unknown> | null) {
  const cast = Array.isArray(payload?.cast)
    ? payload.cast as Array<Record<string, unknown>>
    : [];

  return cast
    .filter((person) => typeof person.name === "string")
    .sort((first, second) =>
      Number(first.order ?? 999) - Number(second.order ?? 999)
    )
    .slice(0, 4)
    .map((person) => {
      const roles = Array.isArray(person.roles)
        ? person.roles as Array<Record<string, unknown>>
        : [];
      const aggregateCharacter = roles.find((role) =>
        typeof role.character === "string" && role.character
      )?.character;
      return {
        name: person.name,
        character: typeof person.character === "string"
          ? person.character
          : typeof aggregateCharacter === "string"
          ? aggregateCharacter
          : null,
        profile: imageUrl(person.profile_path, "w185"),
      };
    });
}

function pickFirst<T>(items: T[] | undefined) {
  return Array.isArray(items) ? items[0] ?? null : null;
}

function pickReleaseDate(
  releases: Record<string, unknown> | null,
  types: number[],
) {
  const results = Array.isArray(releases?.results)
    ? releases.results as Array<Record<string, unknown>>
    : [];
  const orderedCountries = [
    "RU",
    "US",
    ...results.map((item) => item.iso_3166_1).filter((value): value is string =>
      typeof value === "string"
    ),
  ];

  for (const country of [...new Set(orderedCountries)]) {
    const region = results.find((item) => item.iso_3166_1 === country);
    const dates = Array.isArray(region?.release_dates)
      ? region.release_dates as Array<Record<string, unknown>>
      : [];
    const matches = dates
      .filter((item) =>
        types.includes(Number(item.type)) &&
        typeof item.release_date === "string"
      )
      .map((item) => String(item.release_date).slice(0, 10))
      .sort();
    if (matches.length) return matches[0];
  }

  return null;
}

function providersFrom(payload: Record<string, unknown> | null) {
  const results = payload?.results as
    | Record<string, Record<string, unknown>>
    | undefined;
  const region = results?.RU ?? results?.US ??
    pickFirst(Object.values(results ?? {}));
  const providers: string[] = [];

  for (const category of ["flatrate", "rent", "buy"]) {
    const entries = Array.isArray(region?.[category])
      ? region[category] as Array<Record<string, unknown>>
      : [];
    for (const entry of entries) {
      const name = typeof entry.provider_name === "string"
        ? entry.provider_name
        : null;
      if (name && !providers.includes(name)) providers.push(name);
      if (providers.length === 4) return providers;
    }
  }

  return providers;
}

function releaseStatus(
  digitalDate: string | null,
  theatricalDate: string | null,
  providers: string[],
) {
  const today = new Date().toISOString().slice(0, 10);
  if (digitalDate) {
    return digitalDate <= today ? "В цифровом релизе" : "Ожидается";
  }
  if (providers.length) return "В цифровом релизе";
  if (theatricalDate) {
    return theatricalDate <= today ? "Только кинотеатры" : "Ожидается";
  }
  return "Не подтверждено";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return response(request, { error: "Method not allowed" }, 405);
  }

  const tmdbKey = Deno.env.get("TMDB_API_KEY");
  const kinopoiskKey = Deno.env.get("KINOPOISK_API_KEY");
  const omdbKey = Deno.env.get("OMDB_API_KEY");
  if (!tmdbKey || !kinopoiskKey || !omdbKey) {
    return response(
      request,
      { error: "Movie data service is not configured" },
      503,
    );
  }

  const tmdb = async (path: string, params: Record<string, string> = {}) => {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set("api_key", tmdbKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const result = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    return result.ok ? await result.json() as Record<string, unknown> : null;
  };

  const kinopoisk = async (path: string) => {
    const result = await fetch(`https://kinopoiskapiunofficial.tech${path}`, {
      headers: { "X-API-KEY": kinopoiskKey, Accept: "application/json" },
    });
    return result.ok ? await result.json() as Record<string, unknown> : null;
  };

  try {
    const payload = await request.json() as Record<string, unknown>;

    if (payload.action === "search") {
      const query = typeof payload.query === "string"
        ? payload.query.trim()
        : "";
      if (!query || query.length > 120) {
        return response(request, { error: "Invalid search query" }, 400);
      }

      const search = await tmdb("/search/multi", {
        query,
        language: "ru-RU",
        include_adult: "false",
        page: "1",
      });
      const results = (Array.isArray(search?.results) ? search.results : [])
        .filter((item): item is Record<string, unknown> =>
          Boolean(item) &&
          (item.media_type === "movie" || item.media_type === "tv")
        )
        .map((item) => ({
          id: item.id,
          mediaType: item.media_type,
          title: item.title ?? item.name ?? item.original_title ??
            item.original_name,
          year: yearFromDate(item.release_date ?? item.first_air_date),
          overview: item.overview ?? "",
          poster: imageUrl(item.poster_path),
        }))
        .filter((item) =>
          typeof item.id === "number" && typeof item.title === "string"
        )
        .slice(0, 8);

      return response(request, { results });
    }

    if (payload.action !== "details") {
      return response(request, { error: "Unknown action" }, 400);
    }

    const id = numberOrNull(payload.id);
    const mediaType: MediaType = payload.mediaType === "tv" ? "tv" : "movie";
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const year = numberOrNull(payload.year);
    if (!id || id < 1) {
      return response(request, { error: "Invalid title id" }, 400);
    }

    const [details, externalIds, releases, watchProviders, credits] =
      await Promise.all([
        tmdb(`/${mediaType}/${id}`, { language: "ru-RU" }),
        tmdb(`/${mediaType}/${id}/external_ids`),
        mediaType === "movie"
          ? tmdb(`/movie/${id}/release_dates`)
          : Promise.resolve(null),
        tmdb(`/${mediaType}/${id}/watch/providers`),
        mediaType === "tv"
          ? tmdb(`/tv/${id}/aggregate_credits`, { language: "ru-RU" })
          : tmdb(`/movie/${id}/credits`, { language: "ru-RU" }),
      ]);
    if (!details) return response(request, { error: "Title not found" }, 404);

    const imdbId = typeof externalIds?.imdb_id === "string"
      ? externalIds.imdb_id
      : null;
    const omdbUrl = new URL("https://www.omdbapi.com/");
    omdbUrl.searchParams.set("apikey", omdbKey);
    if (imdbId) omdbUrl.searchParams.set("i", imdbId);
    const omdbResponse = imdbId ? await fetch(omdbUrl) : null;
    const omdb = omdbResponse?.ok
      ? await omdbResponse.json() as Record<string, unknown>
      : null;

    let kinopoiskMatch: Record<string, unknown> | null = null;
    if (imdbId) {
      const matches = await kinopoisk(
        `/api/v2.2/films?imdbId=${encodeURIComponent(imdbId)}`,
      );
      kinopoiskMatch = pickFirst(
        matches?.items as Array<Record<string, unknown>> | undefined,
      );
    }
    if (!kinopoiskMatch && title) {
      const matches = await kinopoisk(
        `/api/v2.1/films/search-by-keyword?keyword=${
          encodeURIComponent(title)
        }`,
      );
      const candidates = Array.isArray(matches?.films)
        ? matches.films as Array<Record<string, unknown>>
        : [];
      kinopoiskMatch = candidates.find((item) => Number(item.year) === year) ??
        candidates[0] ?? null;
    }
    const kinopoiskId = numberOrNull(kinopoiskMatch?.kinopoiskId);
    const kinopoiskDetails = kinopoiskId
      ? await kinopoisk(`/api/v2.2/films/${kinopoiskId}`)
      : null;

    const digitalDate = pickReleaseDate(releases, [4]);
    const theatricalDate = pickReleaseDate(releases, [2, 3]);
    const providers = providersFrom(watchProviders);

    return response(request, {
      title: details.title ?? details.name,
      cast: castFrom(credits),
      ratings: {
        imdb: {
          value: numberOrNull(omdb?.imdbRating),
          votes: omdb?.imdbVotes ?? null,
        },
        metascore: { value: numberOrNull(omdb?.Metascore) },
        kinopoisk: {
          value: numberOrNull(kinopoiskDetails?.ratingKinopoisk),
          votes: kinopoiskDetails?.ratingKinopoiskVoteCount ?? null,
        },
      },
      release: {
        status: releaseStatus(digitalDate, theatricalDate, providers),
        digitalDate,
        providers,
      },
      sources: {
        imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null,
        metacriticUrl: "https://www.metacritic.com/",
        kinopoiskUrl: typeof kinopoiskDetails?.webUrl === "string"
          ? kinopoiskDetails.webUrl
          : null,
      },
    });
  } catch (error) {
    console.error("Movie data request failed", error);
    return response(request, { error: "Movie data request failed" }, 502);
  }
});
