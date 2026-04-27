-- Agrega individuales_medal y parejas_medal como game types válidos

ALTER TABLE public.round_game_config
  DROP CONSTRAINT round_game_config_game_type_check;

ALTER TABLE public.round_game_config
  ADD CONSTRAINT round_game_config_game_type_check
  CHECK (game_type IN (
    'marcas', 'marcas_esp',
    'individuales', 'individuales_medal',
    'parejas', 'parejas_medal',
    'parejas_base', 'presiones'
  ));
