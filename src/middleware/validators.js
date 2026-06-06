const { body, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados de entrada inválidos',
      errors: errors.array().map(e => ({
        field: e.path,
        message: e.msg
      }))
    });
  }
  next();
};

const loginValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Nome de usuário é obrigatório'),
  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória'),
  validate
];

const registerValidator = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Nome de usuário deve ter entre 3 e 30 caracteres')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Nome de usuário deve conter apenas letras, números e underscore'),
  body('email')
    .isEmail()
    .withMessage('E-mail inválido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Senha deve ter no mínimo 8 caracteres')
    .matches(/[A-Z]/)
    .withMessage('Senha deve conter pelo menos uma letra maiúscula')
    .matches(/[a-z]/)
    .withMessage('Senha deve conter pelo menos uma letra minúscula')
    .matches(/[0-9]/)
    .withMessage('Senha deve conter pelo menos um dígito')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Senha deve conter pelo menos um caractere especial'),
  validate
];

const passwordValidator = [
  body('new_password')
    .isLength({ min: 8 })
    .withMessage('Nova senha deve ter no mínimo 8 caracteres')
    .matches(/[A-Z]/)
    .withMessage('Nova senha deve conter pelo menos uma letra maiúscula')
    .matches(/[a-z]/)
    .withMessage('Nova senha deve conter pelo menos uma letra minúscula')
    .matches(/[0-9]/)
    .withMessage('Nova senha deve conter pelo menos um dígito')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Nova senha deve conter pelo menos um caractere especial'),
  validate
];

const receiptFilterValidator = [
  query('date_from')
    .optional()
    .isDate()
    .withMessage('Data inicial inválida (formato: YYYY-MM-DD)'),
  query('date_to')
    .optional()
    .isDate()
    .withMessage('Data final inválida (formato: YYYY-MM-DD)'),
  query('value_min')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Valor mínimo deve ser um número positivo'),
  query('value_max')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Valor máximo deve ser um número positivo'),
  query('store')
    .optional()
    .trim()
    .escape(),
  query('type')
    .optional()
    .isIn(['nota_fiscal', 'recibo_cartao_credito', 'recibo_cartao_debito', 'outro'])
    .withMessage('Tipo de recibo inválido'),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'purchase_date', 'total_value', 'store_name', 'type'])
    .withMessage('Campo de ordenação inválido'),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Ordem de classificação inválida (use asc ou desc)'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página deve ser um número inteiro positivo'),
  query('per_page')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Itens por página deve ser entre 1 e 100'),
  validate
];

module.exports = {
  validate,
  loginValidator,
  registerValidator,
  passwordValidator,
  receiptFilterValidator
};
