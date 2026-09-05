CREATE TABLE public.bokamoso_notebooks (
  id text PRIMARY KEY,
  namespace text NOT NULL DEFAULT 'default',
  owner text NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  position bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bokamoso_notebooks_owner ON public.bokamoso_notebooks(namespace, owner, position);

CREATE TABLE public.bokamoso_sources (
  id text NOT NULL,
  notebook_id text NOT NULL REFERENCES public.bokamoso_notebooks(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  position bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (id, notebook_id)
);

CREATE INDEX bokamoso_sources_notebook ON public.bokamoso_sources(notebook_id, position);

CREATE TABLE public.bokamoso_suites (
  id text NOT NULL,
  notebook_id text NOT NULL REFERENCES public.bokamoso_notebooks(id) ON DELETE CASCADE,
  source_ids jsonb NOT NULL CHECK (jsonb_typeof(source_ids) = 'array'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  position bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (id, notebook_id)
);

CREATE INDEX bokamoso_suites_notebook ON public.bokamoso_suites(notebook_id, position DESC);

CREATE TABLE public.bokamoso_progress (
  notebook_id text PRIMARY KEY REFERENCES public.bokamoso_notebooks(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

CREATE TABLE public.bokamoso_notes (
  id text PRIMARY KEY,
  notebook_id text NOT NULL REFERENCES public.bokamoso_notebooks(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  position bigint GENERATED ALWAYS AS IDENTITY
);

CREATE INDEX bokamoso_notes_notebook ON public.bokamoso_notes(notebook_id, position DESC);

CREATE TABLE public.bokamoso_messages (
  id text PRIMARY KEY,
  notebook_id text NOT NULL REFERENCES public.bokamoso_notebooks(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  position bigint GENERATED ALWAYS AS IDENTITY
);

CREATE INDEX bokamoso_messages_notebook ON public.bokamoso_messages(notebook_id, position DESC);

ALTER TABLE public.bokamoso_notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokamoso_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokamoso_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokamoso_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokamoso_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokamoso_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bokamoso_notebooks, public.bokamoso_sources,
  public.bokamoso_suites, public.bokamoso_progress, public.bokamoso_notes,
  public.bokamoso_messages FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bokamoso_notebooks,
  public.bokamoso_sources, public.bokamoso_suites, public.bokamoso_progress,
  public.bokamoso_notes, public.bokamoso_messages TO service_role;

REVOKE ALL ON SEQUENCE public.bokamoso_notebooks_position_seq,
  public.bokamoso_sources_position_seq, public.bokamoso_suites_position_seq,
  public.bokamoso_notes_position_seq, public.bokamoso_messages_position_seq
  FROM PUBLIC, anon, authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.bokamoso_notebooks_position_seq,
  public.bokamoso_sources_position_seq, public.bokamoso_suites_position_seq,
  public.bokamoso_notes_position_seq, public.bokamoso_messages_position_seq
  TO service_role;

CREATE FUNCTION public.bokamoso_save_suite(
  p_notebook_id text, p_suite_id text, p_suite jsonb, p_source_ids jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.bokamoso_notebooks WHERE id = p_notebook_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notebook not found.';
  END IF;
  IF jsonb_array_length(p_source_ids) = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_source_ids) AS selected(source_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bokamoso_sources
      WHERE notebook_id = p_notebook_id AND id = selected.source_id
    )
  ) THEN
    RAISE EXCEPTION 'A selected source is no longer available.';
  END IF;
  INSERT INTO public.bokamoso_suites(id, notebook_id, source_ids, data)
  VALUES (p_suite_id, p_notebook_id, p_source_ids, p_suite)
  ON CONFLICT (id, notebook_id) DO UPDATE
  SET source_ids = EXCLUDED.source_ids, data = EXCLUDED.data, position = DEFAULT;
  RETURN p_suite_id;
END;
$$;

CREATE FUNCTION public.bokamoso_create_notebook(
  p_namespace text, p_owner text, p_notebook jsonb, p_progress jsonb,
  p_sources jsonb DEFAULT '[]'::jsonb, p_suite jsonb DEFAULT NULL,
  p_suite_id text DEFAULT NULL, p_if_empty boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  existing_notebook jsonb;
  notebook_id text := p_notebook->>'id';
  source_data jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_namespace || ':' || p_owner, 0));
  IF p_if_empty THEN
    SELECT data INTO existing_notebook FROM public.bokamoso_notebooks
    WHERE namespace = p_namespace AND owner = p_owner ORDER BY position LIMIT 1;
    IF FOUND THEN
      RETURN existing_notebook;
    END IF;
  END IF;
  INSERT INTO public.bokamoso_notebooks(id, namespace, owner, data)
  VALUES (notebook_id, p_namespace, p_owner, p_notebook);
  INSERT INTO public.bokamoso_progress(notebook_id, data) VALUES (notebook_id, p_progress);
  FOR source_data IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    INSERT INTO public.bokamoso_sources(id, notebook_id, data)
    VALUES (source_data->>'id', notebook_id, source_data);
  END LOOP;
  IF p_suite IS NOT NULL THEN
    PERFORM public.bokamoso_save_suite(notebook_id, p_suite_id, p_suite,
      (SELECT jsonb_agg(value->>'id') FROM jsonb_array_elements(p_sources)));
  END IF;
  RETURN p_notebook;
END;
$$;

CREATE FUNCTION public.bokamoso_delete_source(p_notebook_id text, p_source_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.bokamoso_notebooks WHERE id = p_notebook_id FOR UPDATE;
  DELETE FROM public.bokamoso_sources WHERE notebook_id = p_notebook_id AND id = p_source_id;
  DELETE FROM public.bokamoso_suites WHERE notebook_id = p_notebook_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bokamoso_create_notebook(text, text, jsonb, jsonb, jsonb, jsonb, text, boolean),
  public.bokamoso_save_suite(text, text, jsonb, jsonb), public.bokamoso_delete_source(text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bokamoso_create_notebook(text, text, jsonb, jsonb, jsonb, jsonb, text, boolean),
  public.bokamoso_save_suite(text, text, jsonb, jsonb), public.bokamoso_delete_source(text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';