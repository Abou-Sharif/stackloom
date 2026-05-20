#!/usr/bin/env node

import ora from 'ora';
import chalk from 'chalk';
import generateResource from './generate-resource.js';

const SCENARIOS = {
  parking: {
    description: 'Parking management system — slots, vehicles, tickets, payments',
    resources: [
      {
        name: 'ParkingSlot',
        fields: 'slotNumber:string:required|unique;floor:string;rate:number:required;status:string:required',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Vehicle',
        fields: 'plateNumber:string:required|unique;type:string;ownerName:string;ownerPhone:phone;ownerEmail:email',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Ticket',
        fields: 'entryTime:datetime:required;exitTime:datetime;totalAmount:number;status:string',
        relations: 'vehicle:hasMany:Vehicle:vehicleId;slot:hasMany:ParkingSlot:slotId',
        withFrontend: true,
        arch: 'moderate',
      },
    ],
  },
  payroll: {
    description: 'Payroll management system — departments, employees, timesheets, payroll',
    resources: [
      {
        name: 'Department',
        fields: 'name:string:required;code:string:required|unique;description:text',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Employee',
        fields: 'firstName:string:required;lastName:string:required;email:email:required|unique;position:string;salary:number:required;hireDate:date',
        relations: 'department:hasMany:Department:departmentId',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Timesheet',
        fields: 'date:date:required;hoursWorked:number:required;overtime:number;description:text;status:string',
        relations: 'employee:hasMany:Employee:employeeId',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Payroll',
        fields: 'period:string:required;grossPay:number:required;deductions:number;netPay:number:required;status:string;paymentDate:date',
        relations: 'employee:hasMany:Employee:employeeId',
        withFrontend: true,
        arch: 'moderate',
      },
    ],
  },
  inventory: {
    description: 'Inventory management system — categories, products, suppliers, stock movements',
    resources: [
      {
        name: 'Category',
        fields: 'name:string:required;description:text;slug:string:unique',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Product',
        fields: 'name:string:required;description:text;price:number:required;sku:string:required|unique;stock:number',
        relations: 'category:hasMany:Category:categoryId',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Supplier',
        fields: 'name:string:required;contactPerson:string;email:email;phone:phone;address:text',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'StockMovement',
        fields: 'type:string:required;quantity:number:required;reference:string;notes:text;date:date',
        relations: 'product:hasMany:Product:productId;supplier:hasMany:Supplier:supplierId',
        withFrontend: true,
        arch: 'moderate',
      },
    ],
  },
  booking: {
    description: 'Booking management system — customers, services, bookings, schedules',
    resources: [
      {
        name: 'Customer',
        fields: 'name:string:required;email:email:required|unique;phone:phone;address:text;notes:text',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Service',
        fields: 'name:string:required;description:text;duration:number:required;price:number:required;color:string',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Booking',
        fields: 'date:date:required;time:string:required;status:string;duration:number;notes:text;totalAmount:number',
        relations: 'customer:hasMany:Customer:customerId;service:hasMany:Service:serviceId',
        withFrontend: true,
        arch: 'moderate',
      },
    ],
  },
  delivery: {
    description: 'Delivery management system — drivers, routes, packages, orders',
    resources: [
      {
        name: 'Driver',
        fields: 'name:string:required;email:email;phone:phone;vehicleType:string;licenseNumber:string:required|unique;status:string',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Route',
        fields: 'name:string:required;origin:string;destination:string;estimatedTime:number;distance:number;description:text',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Package',
        fields: 'trackingNumber:string:required|unique;description:text;weight:number;status:string;estimatedDelivery:date',
        relations: '',
        withFrontend: true,
        arch: 'moderate',
      },
      {
        name: 'Order',
        fields: 'orderDate:datetime:required;status:string;deliveryDate:date;notes:text;deliveryFee:number;totalAmount:number',
        relations: 'package:hasMany:Package:packageId;driver:hasMany:Driver:driverId;route:hasMany:Route:routeId',
        withFrontend: true,
        arch: 'moderate',
      },
    ],
  },
};

async function generateResourceSafe(resource, options) {
  try {
    await generateResource('resource', resource.name, {
      fields: resource.fields,
      relations: resource.relations,
      frontend: resource.withFrontend !== false,
      arch: resource.arch || 'moderate',
      formMode: resource.formMode || 'page',
      brief: true,
      ...options,
    });
    return { name: resource.name, ok: true };
  } catch (err) {
    return { name: resource.name, ok: false, error: err.message };
  }
}

export default async function scaffoldCmd(scenarioName, options = {}) {
  const spinner = ora();

  if (!scenarioName || !SCENARIOS[scenarioName]) {
    const available = Object.keys(SCENARIOS).join(', ');
    spinner.fail(
      chalk.red(`Unknown scenario "${scenarioName}". Available: ${available}`),
    );
    process.exitCode = 2;
    return;
  }

  const scenario = SCENARIOS[scenarioName];

  console.log(chalk.bold(`\n📦 Scaffolding: ${scenarioName}`));
  console.log(chalk.dim(scenario.description));
  console.log('');

  const results = [];
  for (const resource of scenario.resources) {
    spinner.start(`Generating ${resource.name}...`);
    const result = await generateResourceSafe(resource, options);
    results.push(result);
    if (result.ok) {
      spinner.succeed(chalk.green(`${resource.name} generated`));
    } else {
      spinner.fail(chalk.red(`${resource.name}: ${result.error}`));
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(chalk.bold(`\n✅ Done — ${ok} resource(s) generated`));
  if (fail > 0) {
    console.log(chalk.yellow(`⚠  ${fail} resource(s) failed`));
  }
}
