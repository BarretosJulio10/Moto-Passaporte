import { describe, expect, it } from 'vitest'
import { translateAuthError } from './authErrors'
import { signUpSchema, signInSchema, resetPasswordSchema, validate } from './schemas'

describe('translateAuthError', () => {
  it('traduz pelo código do Supabase', () => {
    expect(translateAuthError({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.')
    expect(translateAuthError({ code: 'user_already_exists' })).toMatch(/Já existe uma conta/)
  })
  it('traduz pela mensagem quando não há código', () => {
    expect(translateAuthError({ message: 'Email not confirmed' })).toMatch(/Confirme seu e-mail/)
    expect(translateAuthError({ message: 'TypeError: Failed to fetch' })).toMatch(/Sem conexão/)
  })
  it('usa mensagem genérica para erros desconhecidos e nulos', () => {
    expect(translateAuthError({ message: 'xyz' })).toMatch(/Não foi possível/)
    expect(translateAuthError(null)).toMatch(/Não foi possível/)
  })
})

const validSignUp = {
  fullName: 'Ana Souza',
  email: 'ana@exemplo.com',
  password: 'senha1234',
  confirmPassword: 'senha1234',
  acceptTerms: true,
}

describe('signUpSchema', () => {
  it('aceita dados válidos e normaliza espaços', () => {
    const r = validate(signUpSchema, { ...validSignUp, email: '  ana@exemplo.com ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.email).toBe('ana@exemplo.com')
  })
  it('exige aceite dos termos', () => {
    const r = validate(signUpSchema, { ...validSignUp, acceptTerms: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.acceptTerms).toMatch(/termos/)
  })
  it('recusa senha fraca e senhas diferentes', () => {
    const weak = validate(signUpSchema, { ...validSignUp, password: 'abc', confirmPassword: 'abc' })
    expect(weak.ok).toBe(false)
    if (!weak.ok) expect(weak.errors.password).toMatch(/8 caracteres/)

    const noNumber = validate(signUpSchema, { ...validSignUp, password: 'somenteletras', confirmPassword: 'somenteletras' })
    expect(noNumber.ok).toBe(false)
    if (!noNumber.ok) expect(noNumber.errors.password).toMatch(/número/)

    const mismatch = validate(signUpSchema, { ...validSignUp, confirmPassword: 'outra1234' })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.errors.confirmPassword).toMatch(/não conferem/)
  })
  it('recusa e-mail inválido e nome vazio', () => {
    const r = validate(signUpSchema, { ...validSignUp, email: 'ana@', fullName: ' ' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.email).toMatch(/válido/)
      expect(r.errors.fullName).toMatch(/nome/)
    }
  })
})

describe('signInSchema e resetPasswordSchema', () => {
  it('login exige e-mail e senha', () => {
    const r = validate(signInSchema, { email: '', password: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.email).toBeDefined()
      expect(r.errors.password).toBeDefined()
    }
  })
  it('nova senha precisa conferir', () => {
    expect(validate(resetPasswordSchema, { password: 'nova12345', confirmPassword: 'nova12345' }).ok).toBe(true)
    expect(validate(resetPasswordSchema, { password: 'nova12345', confirmPassword: 'x' }).ok).toBe(false)
  })
})
