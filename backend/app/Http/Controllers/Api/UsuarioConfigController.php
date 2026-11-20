<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConfiguracionSistema;
use App\Models\TurnoCaja;
use App\Models\Usuario;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class UsuarioConfigController extends Controller
{
    private const CLAVES_CONFIG_PERMITIDAS = [
        'nombre_negocio',
        'cedula_negocio',
        'telefono_negocio',
        'direccion_negocio',
        'simbolo_moneda',
        'modulo_clientes_activo',
        'modulo_inventario_activo',
        'panel_botones_rapidos',
        'habilitar_bitacora_kardex',
        'impresion_escpos_activa',
        'ancho_papel_mm',
        'nombre_impresora',
        'abrir_cajon_automatico',
        'ruta_respaldo_local',
        'ruta_respaldo_usb',
        'ruta_excel_maestro',
        'encabezado_ticket',
        'mensaje_ticket',
        'sinpe_telefono_receptor',
        'limite_credito_default',
        'iva_porcentaje',
        'iva_canasta_basica',
        'fondo_inicial_sugerido',
        'folio_sucursal',
        'folio_terminal',
        'fe_hacienda_activa',
        'fe_ambiente',
        'fe_codigo_actividad',
        'fe_cabys_default',
        'fe_usuario_atv',
        'fe_ruta_p12',
    ];

    private const CLAVES_RUTA = [
        'ruta_respaldo_local',
        'ruta_respaldo_usb',
        'ruta_excel_maestro',
        'fe_ruta_p12',
    ];

    public function estadoPublico(): JsonResponse
    {
        $config = ConfiguracionSistema::whereIn('clave', [
            'nombre_negocio',
            'fondo_inicial_sugerido',
        ])->pluck('valor', 'clave');

        $turno = TurnoCaja::select('id', 'fecha_apertura', 'estado')
            ->where('estado', 'abierto')
            ->latest('fecha_apertura')
            ->first();

        return response()->json([
            'configuracion' => $config,
            'turno_activo' => $turno,
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $usuario = Usuario::where('username', $datos['username'])->first();

        if (!$usuario || !Hash::check($datos['password'], $usuario->password)) {
            throw ValidationException::withMessages([
                'credenciales' => 'Usuario o contraseña incorrectos.',
            ]);
        }

        if (!$usuario->activo) {
            throw ValidationException::withMessages([
                'credenciales' => 'Esta cuenta de usuario fue eliminada o desactivada.',
            ]);
        }

        // Revocar tokens previos del mismo operador y emitir uno nuevo
        $usuario->tokens()->delete();
        $token = $usuario->createToken('panpos-terminal')->plainTextToken;

        return response()->json([
            'usuario' => $usuario,
            'token' => $token,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['usuario' => $request->user()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();
        return response()->json(['mensaje' => 'Sesión cerrada correctamente.']);
    }

    public function listarUsuarios(): JsonResponse
    {
        return response()->json(Usuario::where('activo', true)->orderBy('nombre')->get());
    }

    public function crearUsuario(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => 'required|string|max:100',
            'username' => 'required|string|max:50|unique:usuarios,username',
            'password' => 'required|string|min:4',
            'rol' => 'required|in:admin,cajero',
        ]);

        $usuario = Usuario::create($datos);
        return response()->json($usuario, 201);
    }

    public function actualizarUsuario(Request $request, Usuario $usuario): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => 'sometimes|string|max:100',
            'password' => 'nullable|string|min:4',
            'rol' => 'sometimes|in:admin,cajero',
            'activo' => 'sometimes|boolean',
            'tema_preferido' => 'sometimes|in:light,dark',
        ]);

        $quiereDegradarAdmin = isset($datos['rol']) && $datos['rol'] === 'cajero' && $usuario->rol === 'admin';
        $quiereDesactivarAdmin = isset($datos['activo']) && !$datos['activo'] && $usuario->rol === 'admin';

        if ($quiereDegradarAdmin || $quiereDesactivarAdmin) {
            $adminsActivos = Usuario::where('rol', 'admin')->where('activo', true)->count();
            if ($adminsActivos <= 1) {
                throw ValidationException::withMessages([
                    'rol' => 'No se puede degradar ni eliminar al único Administrador activo del sistema.',
                ]);
            }
        }

        if (empty($datos['password'])) {
            unset($datos['password']);
        }

        $usuario->update($datos);
        return response()->json($usuario);
    }

    public function eliminarUsuario(Usuario $usuario): JsonResponse
    {
        if ($usuario->rol === 'admin') {
            $adminsActivos = Usuario::where('rol', 'admin')->where('activo', true)->count();
            if ($adminsActivos <= 1) {
                throw ValidationException::withMessages([
                    'usuario' => 'No se puede eliminar al único Administrador activo del sistema.',
                ]);
            }
        }

        $tieneTurnoAbierto = TurnoCaja::where('usuario_id', $usuario->id)->where('estado', 'abierto')->exists();
        if ($tieneTurnoAbierto) {
            throw ValidationException::withMessages([
                'usuario' => "No se puede eliminar a {$usuario->nombre} porque tiene el turno de caja abierto actualmente.",
            ]);
        }

        $usuario->tokens()->delete();

        $tieneHistorial = DB::table('turnos_caja')->where('usuario_id', $usuario->id)->exists()
            || DB::table('ventas')->where('usuario_id', $usuario->id)->exists();

        if ($tieneHistorial) {
            $usuario->update([
                'activo' => false,
                'username' => $usuario->username . '_del_' . time(),
            ]);
        } else {
            $usuario->delete();
        }

        return response()->json(['mensaje' => 'Usuario eliminado correctamente.']);
    }

    public function obtenerConfiguracion(): JsonResponse
    {
        $config = ConfiguracionSistema::pluck('valor', 'clave');
        return response()->json($config);
    }

    public function actualizarConfiguracion(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'configuraciones' => 'required|array',
        ]);

        $publicPathReal = realpath(public_path()) ?: public_path();
        $publicNorm = strtolower(str_replace('\\', '/', rtrim($publicPathReal, '/\\')));

        foreach ($datos['configuraciones'] as $clave => $valor) {
            if (!in_array($clave, self::CLAVES_CONFIG_PERMITIDAS, true)) {
                continue;
            }

            $valorStr = trim((string) ($valor ?? ''));

            if (in_array($clave, self::CLAVES_RUTA, true) && $valorStr !== '') {
                $rutaNorm = strtolower(str_replace('\\', '/', $valorStr));
                $real = realpath($valorStr);
                $realNorm = $real ? strtolower(str_replace('\\', '/', $real)) : $rutaNorm;

                if (
                    str_contains($rutaNorm, '/public') ||
                    str_starts_with($realNorm, $publicNorm) ||
                    str_contains($rutaNorm, '..')
                ) {
                    throw ValidationException::withMessages([
                        $clave => 'Por seguridad, las rutas de respaldo o reportes no pueden apuntar dentro del directorio público.',
                    ]);
                }
            }

            ConfiguracionSistema::updateOrCreate(
                ['clave' => $clave],
                ['valor' => $valorStr]
            );
        }

        return response()->json(ConfiguracionSistema::pluck('valor', 'clave'));
    }
}
