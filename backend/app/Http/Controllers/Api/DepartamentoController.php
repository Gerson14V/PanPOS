<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Departamento;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartamentoController extends Controller
{
    public function index(): JsonResponse
    {
        $departamentos = Departamento::orderBy('nombre')->get();
        return response()->json($departamentos);
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
            'nombre' => 'required|string|max:100|unique:departamentos,nombre,' . $departamento->id,
            'activo' => 'sometimes|boolean',
        ]);

        $departamento->update($datos);
        return response()->json($departamento);
    }
}
