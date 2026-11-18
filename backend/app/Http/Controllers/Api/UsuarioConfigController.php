<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConfiguracionSistema;
use App\Models\Usuario;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class UsuarioConfigController extends Controller
{
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
                'credenciales' => 'Esta cuenta de usuario está desactivada.',
            ]);
        }

        return response()->json(['usuario' => $usuario]);
    }

    public function listarUsuarios(): JsonResponse
    {
        return response()->json(Usuario::orderBy('nombre')->get());
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
                    'rol' => 'No se puede degradar ni desactivar al único Administrador activo del sistema.',
                ]);
            }
        }

        if (empty($datos['password'])) {
            unset($datos['password']);
        }

        $usuario->update($datos);
        return response()->json($usuario);
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

        foreach ($datos['configuraciones'] as $clave => $valor) {
            ConfiguracionSistema::updateOrCreate(
                ['clave' => $clave],
                ['valor' => (string) ($valor ?? '')]
            );
        }

        return response()->json(ConfiguracionSistema::pluck('valor', 'clave'));
    }
}
