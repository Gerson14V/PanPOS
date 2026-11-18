<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Departamento;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DepartamentoController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Departamento::where('activo', true)->orderBy('nombre')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => 'required|string|max:100|unique:departamentos,nombre',
        ]);

        $departamento = Departamento::create($datos);
        return response()->json($departamento, 201);
    }

    public function update(Request $request, Departamento $departamento): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => 'sometimes|string|max:100|unique:departamentos,nombre,' . $departamento->id,
            'activo' => 'sometimes|boolean',
        ]);

        $departamento->update($datos);
        return response()->json($departamento);
    }

    public function destroy(Departamento $departamento): JsonResponse
    {
        $productosActivos = $departamento->productos()->where('activo', true)->count();

        if ($productosActivos > 0) {
            throw ValidationException::withMessages([
                'proveedor' => "No se puede eliminar el proveedor '{$departamento->nombre}' porque tiene {$productosActivos} producto(s) activo(s) asociados. Elimine o cambie de proveedor esos productos primero.",
            ]);
        }

        // Si tuvo productos inactivos en el historial, desactivamos; si está limpio, borramos físico
        if ($departamento->productos()->count() > 0) {
            $departamento->update(['activo' => false]);
        } else {
            $departamento->delete();
        }

        return response()->json(['mensaje' => 'Proveedor eliminado correctamente.']);
    }
}
